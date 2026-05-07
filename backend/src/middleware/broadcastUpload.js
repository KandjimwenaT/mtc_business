const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const broadcastDir = path.join(__dirname, "../../uploads/broadcasts");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(broadcastDir)) {
      fs.mkdirSync(broadcastDir, { recursive: true });
    }
    cb(null, broadcastDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const useExt = allowed.includes(ext) ? ext : ".png";
    cb(null, `${uuidv4()}${useExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
  if (ok) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

module.exports = upload;
