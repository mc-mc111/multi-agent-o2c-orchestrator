import os
import logging
import cloudinary
import cloudinary.uploader
from typing import Optional
from app.config import settings

logger = logging.getLogger("cloudinary_service")

def _clean_str(val: Optional[str]) -> str:
    if not val:
        return ""
    return str(val).strip().strip('"').strip("'").strip()

def _get_credentials():
    cloud_name = _clean_str(settings.CLOUDINARY_CLOUD_NAME) or "dg33de6nl"
    api_key = _clean_str(settings.CLOUDINARY_API_KEY) or "198624871326935"
    api_secret = _clean_str(settings.CLOUDINARY_API_SECRET) or "-gYZHvkMg_MS3ec7CieV0SGzajo"
    return cloud_name, api_key, api_secret

async def upload_file_to_cloudinary(file_bytes: bytes, filename: str, folder: str = "supervity") -> Optional[str]:
    """Uploads file bytes to Cloudinary under the 'supervity' folder with automatic credential sanitization and fallback."""
    cloud_name, api_key, api_secret = _get_credentials()
    
    if not api_key or not api_secret:
        logger.warning("Cloudinary credentials missing or incomplete; falling back to local server endpoint.")
        return None

    # Configure Cloudinary SDK cleanly
    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True
    )
    
    public_id = filename.split(".")[0]
    
    # Try Signed Upload
    try:
        response = cloudinary.uploader.upload(
            file_bytes,
            folder="supervity",
            public_id=public_id,
            resource_type="auto",
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret
        )
        url = response.get("secure_url")
        logger.info(f"Successfully uploaded {filename} to Cloudinary folder 'supervity': {url}")
        return url
    except Exception as e:
        logger.warning(f"Signed Cloudinary upload failed ({e}). Attempting unsigned upload fallback...")
        
    # Unsigned Fallback
    try:
        response = cloudinary.uploader.upload(
            file_bytes,
            folder="supervity",
            public_id=public_id,
            resource_type="auto",
            unsigned=True,
            upload_preset="ml_default",
            cloud_name=cloud_name
        )
        url = response.get("secure_url")
        logger.info(f"Successfully uploaded {filename} via unsigned fallback: {url}")
        return url
    except Exception as err:
        logger.error(f"Cloudinary upload fallback also failed: {err}. Returning local server fallback URL.")
        return None
