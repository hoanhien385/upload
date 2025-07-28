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

// *** PHƯƠNG THỨC XÁC THỰC ĐÃ SỬA LỖI DỨT ĐIỂM ***
const authenticateGoogle = () => {
    console.log('Bắt đầu quá trình xác thực Google...');

    // Lấy nội dung JSON trực tiếp từ biến môi trường GOOGLE_CREDENTIALS
    const credentialsJson = process.env.GOOGLE_CREDENTIALS;

    if (!credentialsJson) {
        console.error('CÁC BIẾN MÔI TRƯỜNG HIỆN CÓ:', Object.keys(process.env).join(', '));
        throw new Error('LỖI CẤU HÌNH: Không tìm thấy biến môi trường "GOOGLE_CREDENTIALS". Vui lòng kiểm tra lại mục "Environment" trên Render.');
    }

    try {
        const credentials = JSON.parse(credentialsJson);
        const auth = new google.auth.GoogleAuth({
            credentials,
            // *** ĐÃ SỬA LỖI CÚ PHÁP CUỐI CÙNG TẠI ĐÂY ***
            // Giá trị scopes phải là một chuỗi URL bình thường, không chứa ký tự Markdown.
            scopes: '[https://www.googleapis.com/auth/drive.file](https://www.googleapis.com/auth/drive.file)',
        });
        return google.drive({ version: 'v3', auth });
    } catch (error) {
        console.error('Lỗi khi phân tích JSON từ biến GOOGLE_CREDENTIALS:', error.message);
        throw new Error('Biến môi trường "GOOGLE_CREDENTIALS" chứa nội dung JSON không hợp lệ.');
    }
};

// Endpoint để upload file
app.post('/upload', upload.single('file'), async (req, res) => {
    // Dòng debug để kiểm tra biến môi trường
    console.log(`DEBUG: Value of GOOGLE_DRIVE_FOLDER_ID is: ${process.env.GOOGLE_DRIVE_FOLDER_ID}`);

    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Không có file nào được tải lên.' });
        }

        const drive = authenticateGoogle();
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        // Tải file lên Google Drive
        const { data: fileData } = await drive.files.create({
            media: {
                mimeType: req.file.mimetype,
                body: bufferStream,
            },
            requestBody: {
                name: req.file.originalname,
                parents: process.env.GOOGLE_DRIVE_FOLDER_ID ? [process.env.GOOGLE_DRIVE_FOLDER_ID] : [],
            },
            fields: 'id, webViewLink',
            supportsAllDrives: true,
        });

        if (!fileData.id) {
            throw new Error('Upload file không thành công, không nhận được ID file.');
        }

        // Cấp quyền công khai cho file
        await drive.permissions.create({
            fileId: fileData.id,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
            supportsAllDrives: true,
        });

        console.log(`File uploaded successfully. Link: ${fileData.webViewLink}`);

        // Trả về link cho frontend
        res.status(200).json({
            message: 'Tải file thành công!',
            link: fileData.webViewLink
        });

    } catch (error) {
        console.error('Lỗi khi tải file lên Google Drive:', error.message);
        res.status(500).json({ message: `Lỗi server: ${error.message}` });
    }
});

app.get('/', (req, res) => {
    res.send('Backend for Google Drive Uploader is running!');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
