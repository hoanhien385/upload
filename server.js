const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const cors = require('cors');
const stream = require('stream');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
});

// 🔐 Xác thực Google Drive bằng Service Account
const authenticateGoogle = () => {
    console.log('🔑 Bắt đầu quá trình xác thực Google...');
    const credentialsJson = process.env.GOOGLE_CREDENTIALS;
    if (!credentialsJson) {
        throw new Error('LỖI CẤU HÌNH: Không tìm thấy biến môi trường GOOGLE_CREDENTIALS.');
    }
    try {
        const credentials = JSON.parse(credentialsJson);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
        return google.drive({ version: 'v3', auth });
    } catch (error) {
        throw new Error('Biến môi trường GOOGLE_CREDENTIALS chứa nội dung JSON không hợp lệ.');
    }
};

// ✅ Kiểm tra quyền truy cập thư mục
const checkParentFolderAccess = async (drive, parentFolderId) => {
    if (!parentFolderId) {
        throw new Error("Bạn PHẢI cấu hình GOOGLE_DRIVE_FOLDER_ID.");
    }
    try {
        console.log(`🔍 Kiểm tra quyền vào thư mục: ${parentFolderId}`);
        await drive.files.get({
            fileId: parentFolderId,
            fields: 'id',
            supportsAllDrives: true,
        });
        console.log('✅ Có quyền truy cập thư mục.');
        return true;
    } catch (error) {
        console.error(`❌ Không thể truy cập thư mục: ${error.message}`);
        throw new Error("Service Account không có quyền vào thư mục được chỉ định.");
    }
};

// 🚀 Endpoint upload file
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Không có file nào được tải lên.' });

        const drive = authenticateGoogle();
        const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        await checkParentFolderAccess(drive, parentFolderId);

        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        const { data: fileData } = await drive.files.create({
            media: { mimeType: req.file.mimetype, body: bufferStream },
            requestBody: {
                name: req.file.originalname,
                parents: [parentFolderId],
            },
            fields: 'id, webViewLink',
            supportsAllDrives: true,
        });

        if (!fileData.id) throw new Error('Không nhận được ID file sau khi upload.');

        await drive.permissions.create({
            fileId: fileData.id,
            requestBody: { role: 'reader', type: 'anyone' },
            supportsAllDrives: true,
        });

        console.log(`✅ File đã upload: ${fileData.webViewLink}`);
        res.status(200).json({ message: 'Tải file thành công!', link: fileData.webViewLink });

    } catch (error) {
        console.error(`🚫 Upload lỗi: ${error.message}`);
        res.status(500).json({ message: `Lỗi server: ${error.message}` });
    }
});

// 📂 Endpoint kiểm tra thư mục được chia sẻ với Service Account
app.get('/list-files', async (req, res) => {
    try {
        const drive = authenticateGoogle();
        const response = await drive.files.list({
            pageSize: 50,
            fields: 'files(id, name, mimeType)',
            q: "mimeType='application/vnd.google-apps.folder' and sharedWithMe",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        const files = response.data.files;
        if (files.length === 0) {
            console.log('📭 Không có thư mục chia sẻ nào.');
            return res.json({
                message: 'Không có thư mục chia sẻ nào được cấp quyền chỉnh sửa.',
                files: [],
            });
        }

        console.log('📂 Thư mục truy cập được:', files.map(f => `${f.name} (${f.id})`));
        res.json({
            message: 'Dưới đây là danh sách thư mục có quyền:',
            files,
        });

    } catch (error) {
        console.error(`🚫 Lỗi liệt kê file: ${error.message}`);
        res.status(500).json({ message: `Lỗi server khi liệt kê file: ${error.message}` });
    }
});

app.get('/', (req, res) => res.send('✅ Backend Google Drive uploader đang chạy!'));
app.listen(port, () => console.log(`🚀 Server is running on port ${port}`));
