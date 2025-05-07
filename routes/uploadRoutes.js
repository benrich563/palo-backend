import express from 'express';
import { auth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

const router = express.Router();

const bufferToStream = (buffer) => {
  return Readable.from(buffer);
};

router.post('/image', [auth, upload.single('image')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image' });
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'delivery/images',
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) {
            console.error('Upload error:', error);
            return res.status(500).json({ message: 'Upload failed' });
          }
          res.json({
            url: result.secure_url,
            public_id: result.public_id
          });
        }
      );

      bufferToStream(req.file.buffer).pipe(stream);
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/image/:publicId', auth, async (req, res) => {
  try {
    const result = await cloudinary.uploader.destroy(req.params.publicId);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;