import { v2 as cloudinary } from 'cloudinary';

const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
const apiKey = process.env['CLOUDINARY_API_KEY'];
const apiSecret = process.env['CLOUDINARY_API_SECRET'];

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });
}

export const uploadImageBuffer = async (
  fileBuffer: Buffer,
  folder: string
): Promise<{ secureUrl: string; publicId: string }> => {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary configuration is missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image'
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Cloudinary upload failed'));
          return;
        }

        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id
        });
      }
    );

    uploadStream.end(fileBuffer);
  });
};

export default cloudinary;
