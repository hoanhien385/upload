const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const cors = require('cors');
const stream = require('stream');
require('dotenv').config(); // Để đọc các biến môi trường từ file .env (khi chạy local)

const app = express();
const port = process.env.PORT || 3000;

// Cấu hình CORS để cho phép frontend truy cập
app.use(cors());

// Cấu hình Multer để xử lý file upload trong bộ nhớ
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // Giới hạn file 20MB, bạn có thể thay đổi
});

// Hàm khởi tạo và xác thực với Google Drive API
const authenticateGoogle = () => {
    // Đọc thông tin xác thực từ biến môi trường
    // Trên Render, bạn sẽ tạo một Secret File thay vì dùng file .json trực tiếp
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: '[https://www.googleapis.com/auth/drive.file](https://www.googleapis.com/auth/drive.file)',
    });
    return google.drive({ version: 'v3', auth });
};

// Endpoint để upload file
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Không có file nào được tải lên.' });
        }

        const drive = authenticateGoogle();
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        // 1. Tải file lên Google Drive
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
        });

        if (!fileData.id) {
             throw new Error('Upload file không thành công, không nhận được ID file.');
        }

        // 2. Cấp quyền công khai cho file vừa tải lên
        await drive.permissions.create({
            fileId: fileData.id,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        // *** LƯU Ý LỖI ***
        // Log lỗi của bạn báo "SyntaxError: Unexpected identifier 'File'" tại dòng dưới đây.
        // Lỗi này hầu như luôn xảy ra do bạn vô tình xóa mất dấu backtick (`) ở đầu chuỗi.
        // Hãy đảm bảo dòng code của bạn giống hệt như dòng dưới đây.
        console.log(`File uploaded successfully. Link: ${fileData.webViewLink}`);

        // 3. Trả về link cho frontend
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
