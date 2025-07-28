const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const cors = require('cors');
const stream = require('stream');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const authenticateGoogle = () => {
    console.log('🔑 Bắt đầu quá trình xác thực Google...');
    const credentialsJson = process.env.GOOGLE_CREDENTIALS;
    if (!credentialsJson) {
        throw new Error('LỖI CẤU HÌNH: Không tìm thấy biến môi trường "GOOGLE_CREDENTIALS".');
    }
    try {
        const credentials = JSON.parse(credentialsJson);
        const auth = new google.auth.GoogleAuth({
            credentials,
            // *** ĐÃ SỬA LỖI CÚ PHÁP DỨT ĐIỂM TẠI ĐÂY ***
            scopes: '[https://www.googleapis.com/auth/drive.file](https://www.googleapis.com/auth/drive.file)',
        });
        return google.drive({ version: 'v3', auth });
    } catch (error) {
        throw new Error('Biến môi trường "GOOGLE_CREDENTIALS" chứa nội dung JSON không hợp lệ.');
    }
};

// Hàm kiểm tra quyền truy cập vào thư mục cha
const checkParentFolderAccess = async (drive, parentFolderId) => {
    if (!parentFolderId) {
        throw new Error("Service account không có bộ nhớ riêng. Bạn PHẢI cung cấp ID thư mục trong biến môi trường GOOGLE_DRIVE_FOLDER_ID.");
    }
    try {
        console.log(`🔎 Đang kiểm tra quyền truy cập vào thư mục cha: ${parentFolderId}`);
        await drive.files.get({
            fileId: parentFolderId,
            fields: 'id',
            supportsAllDrives: true,
        });
        console.log(`✅ Có quyền truy cập vào thư mục cha: ${parentFolderId}`);
        return true;
    } catch (error) {
        console.error(`❌ Không thể truy cập thư mục Drive. Lý do: ${error.message}`);
        throw new Error("Service account không có quyền truy cập thư mục Drive được chỉ định.");
    }
};


app.post('/upload', async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Không có file nào được tải lên.' });

        const drive = authenticateGoogle();
        const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        await checkParentFolderAccess(drive, parentFolderId);

        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        const { data: fileData } = await drive.files.create({
            media: { mimeType: req.file.mimetype, body: bufferStream },
            requestBody: { name: req.file.originalname, parents: [parentFolderId] },
            fields: 'id, webViewLink',
            supportsAllDrives: true,
        });

        if (!fileData.id) throw new Error('Upload file không thành công.');

        await drive.permissions.create({
            fileId: fileData.id,
            requestBody: { role: 'reader', type: 'anyone' },
            supportsAllDrives: true,
        });

        console.log(`✅ File uploaded successfully. Link: ${fileData.webViewLink}`);
        res.json({ message: 'Tải file thành công!', link: fileData.webViewLink });

    } catch (error) {
        console.error(`� Lỗi khi tải file lên Google Drive: ${error.message}`);
        res.status(500).json({ message: `Lỗi server: ${error.message}` });
    }
});

// Endpoint debug
app.get('/list-files', async (req, res) => {
    console.log('🔎 Yêu cầu liệt kê file và thư mục...');
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
            console.log('✅ Service Account không thấy thư mục nào được chia sẻ.');
            return res.json({ message: 'Không tìm thấy thư mục nào được chia sẻ. Hãy chắc chắn bạn đã chia sẻ thư mục (không phải file) và cấp quyền "Người chỉnh sửa".', files: [] });
        }
        console.log('✅ Đã tìm thấy các mục sau:', files.map(f => ({ name: f.name, id: f.id })));
        res.json({ message: 'Thành công! Dưới đây là danh sách các thư mục mà Service Account có thể truy cập:', files });
    } catch (error) {
        console.error(`🚫 Lỗi khi liệt kê file: ${error.message}`);
        res.status(500).json({ message: `Lỗi server khi liệt kê file: ${error.message}` });
    }
});


app.get('/', (req, res) => res.send('Backend for Google Drive Uploader is running!'));
app.listen(port, () => console.log(`Server is running on port ${port}`));
