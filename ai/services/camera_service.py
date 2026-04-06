"""
Camera Service
Handles camera initialization and frame capture (cross-platform)
"""

import cv2
import logging
import platform
from config import Config

logger = logging.getLogger(__name__)


class CameraService:
    """Manages camera capture using OpenCV with platform-specific backends"""

    def __init__(self):
        self.cap = None
        self.camera_index = Config.CAMERA_INDEX
        self.is_running = False
        self.backend = self._get_backend()

    def _get_backend(self):
        """Determine appropriate backend based on platform"""
        system = platform.system()
        if system == 'Windows':
            return ('DirectShow', cv2.CAP_DSHOW)
        elif system == 'Linux':
            return ('V4L2', cv2.CAP_V4L2)
        elif system == 'Darwin':  # macOS
            return ('AVFoundation', cv2.CAP_AVFOUNDATION)
        else:
            return ('Default', cv2.CAP_ANY)

    def initialize(self):
        """Initialize camera with platform-specific backend"""
        try:
            backend_name, backend_api = self.backend
            logger.info(f"Initializing camera {self.camera_index} with {backend_name} backend...")

            # Try platform-specific backend first
            self.cap = cv2.VideoCapture(self.camera_index, backend_api)

            # Fall back to default if specific backend fails
            if not self.cap.isOpened():
                logger.warning(f"{backend_name} backend failed, trying default...")
                self.cap = cv2.VideoCapture(self.camera_index)

            if not self.cap.isOpened():
                raise Exception(f"Failed to open camera {self.camera_index}")

            # Set camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, Config.FRAME_WIDTH)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, Config.FRAME_HEIGHT)
            self.cap.set(cv2.CAP_PROP_FPS, Config.FPS)

            # Disable autofocus for faster processing (may not work on all cameras)
            try:
                self.cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)
            except:
                pass  # Some cameras don't support this

            # Verify settings
            actual_width = self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            actual_height = self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            actual_fps = self.cap.get(cv2.CAP_PROP_FPS)

            logger.info(f"Camera initialized: {actual_width}x{actual_height} @ {actual_fps} FPS using {backend_name}")

            self.is_running = True
            return True

        except Exception as e:
            logger.error(f"Failed to initialize camera: {str(e)}")
            raise

    def read_frame(self):
        """Read a frame from the camera"""
        if not self.cap or not self.cap.isOpened():
            raise Exception("Camera not initialized or disconnected")

        ret, frame = self.cap.read()

        if not ret:
            raise Exception("Failed to read frame from camera")

        return frame

    def release(self):
        """Release camera resources"""
        if self.cap:
            logger.info("Releasing camera...")
            self.cap.release()
            self.is_running = False

    def is_available(self):
        """Check if camera is available and working"""
        return self.cap is not None and self.cap.isOpened()

    def get_info(self):
        """Get camera information"""
        if not self.cap:
            return None

        backend_name, _ = self.backend

        return {
            'index': self.camera_index,
            'width': int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            'height': int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            'fps': int(self.cap.get(cv2.CAP_PROP_FPS)),
            'backend': backend_name,
            'is_running': self.is_running
        }
