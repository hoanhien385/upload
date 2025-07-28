const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const cors = require('cors');
const stream = require('stream');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Cấu hình CORS
app.use(cors());

// Cấu hình Multer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
});

// PHƯƠNG THỨC XÁC THỰC GOOGLE
const authenticateGoogle = () => {
    console.log('🔑 Bắt đầu quá trình xác thực Google...');

    const credentialsJson = process.env.GOOGLE_CREDENTIALS;

    if (!credentialsJson) {
        console.error('❌ Không tìm thấy biến môi trường "GOOGLE_CREDENTIALS"');
        throw new Error('Lỗi cấu hình: GOOGLE_CREDENTIALS không tồn tại');
    }

    try {
        const credentials = JSON.parse(credentialsJson);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
        return google.drive({ version: 'v3', auth });
    } catch (error) {
        console.error('❌ Lỗi JSON GOOGLE_CREDENTIALS:', error.message);
        throw new Error('GOOGLE_CREDENTIALS không hợp lệ.');
    }
};

// Endpoint để upload file
app.post('/upload', upload.single('file'), async (req, res) => {
    console.log(`📂 GOOGLE_DRIVE_FOLDER_ID = ${process.env.GOOGLE_DRIVE_FOLDER_ID}`);

    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Không có file nào được tải lên.' });
        }

        const drive = authenticateGoogle();
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        // 📋 KIỂM TRA QUYỀN TRUY CẬP FOLDER
        try {
            const permissions = await drive.permissions.list({
                fileId: folderId,
                supportsAllDrives: true,
            });
            console.log('✅ Folder permissions:', JSON.stringify(permissions.data, null, 2));
        } catch (permErr) {
            console.error('❌ Không thể truy cập thư mục Drive. Lý do:', permErr.message);
            throw new Error('Service account không có quyền truy cập thư mục Drive được chỉ định.');
        }

        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        // 🆙 TẢI FILE LÊN GOOGLE DRIVE
        const { data: fileData } = await drive.files.create({
            media: {
                mimeType: req.file.mimetype,
                body: bufferStream,
            },
            requestBody: {
                name: req.file.originalname,
                parents: folderId ? [folderId] : [],
            },
            fields: 'id, webViewLink',
            supportsAllDrives: true,
        });

        if (!fileData.id) {
            throw new Error('Upload file không thành công, không nhận được ID file.');
        }

        // 🌐 CẤP QUYỀN CÔNG KHAI
        await drive.permissions.create({
            fileId: fileData.id,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
            supportsAllDrives: true,
        });

        console.log(`✅ Tải file thành công: ${fileData.webViewLink}`);

        res.status(200).json({
            message: 'Tải file thành công!',
            link: fileData.webViewLink,
        });

    } catch (error) {
        console.error('🚫 Lỗi khi tải file lên Google Drive:', error.message);
        res.status(500).json({ message: `Lỗi server: ${error.message}` });
    }
});

// Trang mặc định
app.get('/', (req, res) => {
    res.send('Backend for Google Drive Uploader is running!');
});

// Lắng nghe cổng
app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
});
