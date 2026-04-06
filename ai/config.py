"""
Configuration Loader for Python AI Engine
Loads environment variables and provides configuration constants
"""

import os
from dotenv import load_dotenv

# Load environment variables from parent directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))


class Config:
    """Configuration class for AI engine"""

    # WebSocket Configuration
    WS_HOST = os.getenv('WS_HOST', 'localhost')
    WS_PORT = int(os.getenv('WS_PORT', 8080))
    WS_URL = f"ws://{WS_HOST}:{WS_PORT}"

    # Camera Configuration
    CAMERA_INDEX = int(os.getenv('CAMERA_INDEX', 0))
    FRAME_WIDTH = int(os.getenv('FRAME_WIDTH', 640))
    FRAME_HEIGHT = int(os.getenv('FRAME_HEIGHT', 480))
    FPS = int(os.getenv('FPS', 15))

    # Face Recognition Configuration
    CONFIDENCE_THRESHOLD = float(os.getenv('CONFIDENCE_THRESHOLD', 0.6))
    RECOGNITION_COOLDOWN_MINUTES = int(os.getenv('RECOGNITION_COOLDOWN_MINUTES', 5))

    # Processing Configuration
    PROCESS_EVERY_N_FRAMES = 3  # Only process every 3rd frame for performance
    FACE_DETECTION_MODEL = 'hog'  # 'hog' is faster than 'cnn'

    # Paths
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_DIR = os.path.join(BASE_DIR, 'data')
    ENCODINGS_DIR = os.path.join(DATA_DIR, 'encodings')
    TEMP_DIR = os.path.join(DATA_DIR, 'temp')

    @classmethod
    def validate(cls):
        """Validate configuration"""
        errors = []

        if cls.CONFIDENCE_THRESHOLD < 0 or cls.CONFIDENCE_THRESHOLD > 1:
            errors.append("CONFIDENCE_THRESHOLD must be between 0 and 1")

        if cls.FPS < 1 or cls.FPS > 60:
            errors.append("FPS must be between 1 and 60")

        if cls.CAMERA_INDEX < 0:
            errors.append("CAMERA_INDEX must be >= 0")

        if errors:
            raise ValueError(f"Configuration errors: {', '.join(errors)}")

        return True


# Validate configuration on load
Config.validate()
