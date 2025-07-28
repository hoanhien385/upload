const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const session = require('express-session');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const stream = require('stream');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// CORS để cho phép frontend truy cập từ domain khác (ví dụ: localhost hoặc Vercel)
app.use(cors({
  origin: true,              // hoặc origin cụ thể như 'https://your-frontend.vercel.app'
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: 'drive_secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    sameSite: 'lax', // hoặc 'none' nếu frontend khác domain và dùng https
    secure: false    // để true nếu frontend dùng https (Render mặc định là true)
  }
}));

// Multer config
const upload = multer({ storage: multer.memoryStorage() });

// OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Bước 1: Redirect người dùng đến Google
app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent',
  });
  res.redirect(url);
});

// Bước 2: Google redirect lại về server kèm mã
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens;
    res.send('✅ Xác thực thành công! Giờ bạn có thể quay lại và upload file.');
  } catch (err) {
    res.status(500).send('❌ Lỗi xác thực: ' + err.message);
  }
});

// Bước 3: Upload file sau khi xác thực
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.session.tokens) return res.status(401).send('❌ Chưa xác thực OAuth');

  try {
    oauth2Client.setCredentials(req.session.tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    const response = await drive.files.create({
      requestBody: {
        name: req.file.originalname,
      },
      media: {
        mimeType: req.file.mimetype,
        body: bufferStream,
      },
      fields: 'id, webViewLink',
    });

    res.json({ link: response.data.webViewLink });
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Upload thất bại: ' + err.message);
  }
});

// Kiểm tra server sống
app.get('/', (req, res) => {
  res.send('✅ Google Drive OAuth Upload Server đang chạy!');
});

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
