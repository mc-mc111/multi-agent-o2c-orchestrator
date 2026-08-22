import os
import logging
import cloudinary
import cloudinary.uploader
from typing import Optional
from app.config import settings

logger = logging.getLogger("cloudinary_service")

def _init_cloudinary():
    # Initialize Cloudinary using settings
    if settings.CLOUDINARY_URL and "cloudinary://" in settings.CLOUDINARY_URL:
        os.environ["CLOUDINARY_URL"] = settings.CLOUDINARY_URL
    elif settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY:
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True
        )

_init_cloudinary()

async def upload_file_to_cloudinary(file_bytes: bytes, filename: str, folder: str = "supervity") -> Optional[str]:
    """Uploads file bytes to Cloudinary under the 'supervity' folder and returns secure URL."""
    try:
        _init_cloudinary()
        if not settings.CLOUDINARY_CLOUD_NAME or settings.CLOUDINARY_CLOUD_NAME == "your-cloud-name":
            logger.warning("Cloudinary credentials not set; returning fallback URL.")
            return None
        
        response = cloudinary.uploader.upload(
            file_bytes,
            folder="supervity",
            public_id=filename.split(".")[0],
            resource_type="auto"
        )
        url = response.get("secure_url")
        logger.info(f"Successfully uploaded {filename} to Cloudinary: {url}")
        return url
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {e}")
        return None
