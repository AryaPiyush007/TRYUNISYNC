import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify configuration
if (!cloudinary.config().cloud_name || !cloudinary.config().api_key || !cloudinary.config().api_secret) {
  throw new Error('Cloudinary configuration is missing. Please check environment variables.');
}

export { cloudinary };

// Helper function to get folder name based on current date
export const getUploadFolder = (type: 'uploads' | 'marketplace' | 'events' = 'uploads'): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return `unisync/${type}/${year}/${month}`;
};

// Upload file to Cloudinary
export const uploadToCloudinary = async (
  file: Buffer,
  filename: string,
  folder: string = 'uploads'
): Promise<{ secure_url: string; public_id: string; resource_type: string }> => {
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          public_id: `${Date.now()}-${filename}`,
          folder: getUploadFolder(folder),
          quality: 'auto',
          fetch_format: 'auto',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      ).end(file);
    });

    return result as {
      secure_url: string;
      public_id: string;
      resource_type: string;
    };
  } catch (error) {
    throw new Error(`Failed to upload to Cloudinary: ${error}`);
  }
};

// Delete file from Cloudinary
export const deleteFromCloudinary = async (
  public_id: string,
  resource_type: string = 'image'
): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(public_id, {
      resource_type: resource_type as any,
    });
  } catch (error) {
    throw new Error(`Failed to delete from Cloudinary: ${error}`);
  }
};

// Get file info from Cloudinary URL
export const getFileInfoFromUrl = (url: string): { public_id: string; folder: string } | null => {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const fileNameIndex = pathParts.findIndex(part => part.includes('unisync'));

    if (fileNameIndex === -1) return null;

    const publicId = pathParts.slice(fileNameIndex).join('/').replace(/\.[^/.]+$/, '');
    const folderMatch = publicId.match(/unisync\/([^\/]+)/);
    const folder = folderMatch ? folderMatch[1] : 'uploads';

    return {
      public_id: publicId,
      folder
    };
  } catch (error) {
    return null;
  }
};

// Validate file type
export const isFileTypeAllowed = (mimetype: string): boolean => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain'
  ];

  return allowedTypes.includes(mimetype);
};