const multer = require("multer");

const MAX_BYTES = 50 * 1024 * 1024;

const excelFileFilter = (req, file, cb) => {
  const name = (file.originalname || "").toLowerCase();
  const extOk = name.endsWith(".xlsx");
  const mime = file.mimetype || "";
  const mimeOk =
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/octet-stream";
  if (extOk || mimeOk) {
    cb(null, true);
  } else {
    cb(new Error("Only Excel .xlsx files are allowed"));
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: excelFileFilter,
});

module.exports = upload;
