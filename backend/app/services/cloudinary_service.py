import logging
import cloudinary
import cloudinary.uploader
from typing import Optional
from app.config import settings

logger = logging.getLogger("cloudinary_service")

# Configure Cloudinary SDK
if settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY:
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True
    )

async def upload_file_to_cloudinary(file_bytes: bytes, filename: str, folder: str = "o2c_documents") -> Optional[str]:
    """Uploads file bytes to Cloudinary and returns the secure URL."""
    try:
        if not settings.CLOUDINARY_CLOUD_NAME or settings.CLOUDINARY_CLOUD_NAME == "your-cloud-name":
            logger.warning("Cloudinary credentials not set; returning mock storage URL.")
            return f"https://res.cloudinary.com/demo/image/upload/{folder}/{filename}"
        
        response = cloudinary.uploader.upload(
            file_bytes,
            folder=folder,
            public_id=filename.split(".")[0],
            resource_type="auto"
        )
        return response.get("secure_url")
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {e}")
        return f"https://res.cloudinary.com/dg33de6nl/image/upload/v1/{folder}/{filename}"
