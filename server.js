const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const qr = require("qrcode");
const sharp = require("sharp");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT;
console.log(process.env)
// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
// Define Schema for QR Code Data
const QRCodeSchema = new mongoose.Schema({
  title: String,
  subtitle: String,
  description: String,
  bgColor: String,
  pdfUrl: String,
  previewImage: String,
  qrCodeUrl: String,
});
const QRCodeData = mongoose.model("QRCodeData", QRCodeSchema);

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer (Store in memory, then upload to Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// Home Page
app.get("/", (req, res) => {
  res.render("index", { qrImage: null });
});

// Function to Upload File to Cloudinary
const uploadToCloudinary = (fileBuffer, folder, resourceType) => {
  if (resourceType == "raw"){
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: resourceType, folder, format: "pdf"},
        (error, result) => {
          if (error) {
            console.error("Cloudinary Upload Error:", error);
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );
      stream.end(fileBuffer);
    });
  }
  else {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: resourceType, folder },
        (error, result) => {
          if (error) {
            console.error("Cloudinary Upload Error:", error);
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );
      stream.end(fileBuffer);
    });
  }
};


// Generate QR Code for PDF
app.post("/generate", upload.fields([{ name: "pdf" }, { name: "preview" }]), async (req, res) => {
  const { title, description, subtitle, bgColor } = req.body;
  const pdfBuffer = req.files["pdf"][0].buffer;
  const previewBuffer = req.files["preview"][0].buffer;

  try {
    // Upload PDF & Preview Image to Cloudinary
    const pdfUrl = await uploadToCloudinary(pdfBuffer, "qr_pdfs", "raw");
    const previewUrl = await uploadToCloudinary(previewBuffer, "qr_previews", "image");

    if (!pdfUrl || !previewUrl) {
      return res.status(500).send("File upload failed.");
    }

    // Create landing page URL
    const qrData = new QRCodeData({
      title,
      subtitle,
      description,
      bgColor,
      pdfUrl,
      previewImage: previewUrl,
    });

    const savedData = await qrData.save();
    const landingPageUrl = `${req.protocol}://${req.get("host")}/view/${savedData._id}`;

    // Generate QR Code
    const qrImageData = await qr.toDataURL(landingPageUrl, { errorCorrectionLevel: 'H' });

    // Convert QR Code Image and Resize
    const qrBuffer = Buffer.from(qrImageData.split(',')[1], 'base64');
    const resizedQrBuffer = await sharp(qrBuffer).resize(500).png().toBuffer();

    // Upload QR Code Image to Cloudinary
    const qrCodeUrl = await uploadToCloudinary(resizedQrBuffer, "qr_codes", "image");

    // Update QR Code URL in MongoDB
    savedData.qrCodeUrl = qrCodeUrl;
    await savedData.save();

    // Render the page with QR Code
    res.render("index", { qrImage: qrImageData, qrDownload: qrCodeUrl });
  } catch (err) {
    console.error("Error generating QR code:", err);
    res.status(500).send("Error processing the request.");
  }
});

// Landing Page for Scanned QR Code
app.get("/view/:id", async (req, res) => {
  try {
    const data = await QRCodeData.findById(req.params.id);
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
  } catch (err) {
    console.error("Error retrieving landing page:", err);
    res.status(500).send("Error loading the page.");
  }
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});
