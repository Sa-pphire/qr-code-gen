const express = require("express");
const qr = require("qrcode");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp"); // Import sharp

const app = express();
const PORT = process.env.PORT;

// JSON file to store landing page data
const DATA_FILE = "./landingPages.json";

// Load existing landing pages from JSON file
let landingPages = {};
if (fs.existsSync(DATA_FILE)) {
  landingPages = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

// Function to save landing pages to JSON file
const saveLandingPages = () => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(landingPages, null, 2), "utf8");
};

// Configure storage for PDF uploads
const storage = multer.diskStorage({
  destination: "./public/uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// Home Page
app.get("/", (req, res) => {
  res.render("index", { qrImage: null });
});

// Generate QR Code for PDF
app.post("/generate", upload.fields([{ name: "pdf" }, { name: "preview" }]), async (req, res) => {
  const { title, description, subtitle, bgColor } = req.body;
  const pdfFilename = req.files["pdf"][0].filename;
  const previewFilename = req.files["preview"][0].filename;
  const pdfPath = `/uploads/${pdfFilename}`;
  const previewImagePath = `/uploads/${previewFilename}`;
  const landingPageUrl = `${req.protocol}://${req.get("host")}/view/${pdfFilename}`;

  try {
    // Save landing page data
    landingPages[pdfFilename] = {
      title,
      subtitle,
      description,
      bgColor,
      pdfUrl: pdfPath,
      previewImage: previewImagePath,
    };
    saveLandingPages();

    // Generate QR Code with high resolution
    const qrImageData = await qr.toDataURL(landingPageUrl, { size: 30, errorCorrectionLevel: 'H' });

    // Convert QR code data URL to buffer and resize using sharp
    const buffer = Buffer.from(qrImageData.split(',')[1], 'base64');

    // Resize the image to 1000px width (adjust as needed)
    const resizedQrImage = await sharp(buffer)
      .resize(500) // Width in pixels, you can adjust it
      .png({ quality: 100 })
      .toBuffer();

    // Save resized QR image as PNG
    const qrDownloadPath = path.join(__dirname, "public/uploads", Date.now() + ".png");
    await sharp(resizedQrImage).toFile(qrDownloadPath);

    // Return the image URL for downloading
    const qrDownloadUrl = `/uploads/${path.basename(qrDownloadPath)}`;

    // Render the index page with the new QR image and download link
    res.render("index", { qrImage: qrImageData, qrDownload: qrDownloadUrl });
  } catch (err) {
    console.error("Error processing PDF:", err);
    res.status(500).send("Error generating QR code and preview.");
  }
});

// Landing Page for Scanned QR Code
app.get("/view/:filename", (req, res) => {
  const { filename } = req.params;
  const data = landingPages[filename];

  if (!data) {
    return res.status(404).send("Page not found.");
  }

  res.render("landing", {
    title: data.title,
    subtitle: data.subtitle,
    description: data.description,
    bgColor: data.bgColor,
    pdfUrl: data.pdfUrl,
    previewImage: data.previewImage,
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
