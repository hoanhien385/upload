const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const cors = require('cors');
const stream = require('stream');
const fs = require('fs'); // Thêm module 'fs' để đọc file
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
    let credentials;
    
    console.log('Bắt đầu quá trình xác thực Google...');
    
    // *** PHẦN SỬA LỖI VÀ CẢI TIẾN ***
    // Logic mới này sẽ tự động tìm biến môi trường mà Render tạo ra cho tệp bí mật
    // Ví dụ: file 'my_key.json' -> biến env 'MY_KEY_JSON'
    const secretFileEnvVar = Object.keys(process.env).find(key => key.endsWith('_JSON'));
    
    if (secretFileEnvVar) {
        const secretFilePath = process.env[secretFileEnvVar];
        console.log(`Đã tìm thấy biến môi trường cho tệp bí mật: ${secretFileEnvVar}`);
        if (fs.existsSync(secretFilePath)) {
            console.log(`Đang tải credentials từ đường dẫn: ${secretFilePath}`);
            const credentialsFileContent = fs.readFileSync(secretFilePath, 'utf8');
            credentials = JSON.parse(credentialsFileContent);
        } else {
             throw new Error(`Tệp bí mật được chỉ định tại '${secretFilePath}' không tồn tại trên server.`);
        }
    } else {
        // Phương án dự phòng: đọc trực tiếp từ biến môi trường GOOGLE_CREDENTIALS
        console.log('Không tìm thấy biến môi trường cho tệp bí mật. Thử đọc từ GOOGLE_CREDENTIALS...');
        if (process.env.GOOGLE_CREDENTIALS) {
            credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        } else {
            // Nếu cả hai cách đều thất bại, đưa ra thông báo lỗi chi tiết
            console.error('CÁC BIẾN MÔI TRƯỜNG HIỆN CÓ:', Object.keys(process.env).join(', '));
            throw new Error('LỖI CẤU HÌNH: Không tìm thấy biến môi trường chứa credentials. Vui lòng kiểm tra lại mục "Environment" trên Render. Bạn cần tạo một "Secret File" (ví dụ: google_credentials.json).');
        }
    }
    
    const auth = new google.auth.GoogleAuth({
        credentials,
        // Đã sửa lỗi cú pháp ở đây. Nó phải là một chuỗi bình thường.
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
