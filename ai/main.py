"""
Apollo AI Engine - Main Entry Point
Facial recognition engine for attendance tracking
"""

import logging
import sys
import signal
import time
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from services.camera_service import CameraService
from services.recognition_service import RecognitionService
from services.websocket_client import WebSocketClient

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('../logs/ai-engine.log')
    ]
)

logger = logging.getLogger(__name__)


class ApolloAIEngine:
    """Main AI Engine class"""

    def __init__(self):
        self.camera = None
        self.recognition = None
        self.ws = None
        self.is_running = False
        self.frame_count = 0
        self.last_status_time = time.time()

    def initialize(self):
        """Initialize all services"""
        try:
            logger.info("🚀 Starting Apollo AI Engine...")
            logger.info(f"Configuration: {Config.FRAME_WIDTH}x{Config.FRAME_HEIGHT} @ {Config.FPS} FPS")
            logger.info(f"Confidence threshold: {Config.CONFIDENCE_THRESHOLD}")

            # Initialize camera
            self.camera = CameraService()
            self.camera.initialize()
            logger.info("✅ Camera initialized")

            # Initialize recognition service
            self.recognition = RecognitionService()
            logger.info("✅ Recognition service initialized")

            # Initialize WebSocket client
            self.ws = WebSocketClient(on_message_callback=self.handle_ws_message)
            self.ws.connect()

            # Wait for WebSocket connection
            if not self.ws.wait_for_connection(timeout=30):
                raise Exception("Failed to connect to WebSocket server")

            logger.info("✅ WebSocket connected")

            # Request employee data from server
            self.request_employee_data()

            self.is_running = True
            logger.info("✅ Apollo AI Engine started successfully")

        except Exception as e:
            logger.error(f"Failed to initialize AI engine: {str(e)}")
            raise

    def request_employee_data(self):
        """Request employee data from Node.js server"""
        logger.info("Requesting employee data from server...")

        # In a real implementation, the server would respond with employee data
        # For now, we'll use a placeholder
        # TODO: Implement proper request/response pattern
        pass

    def handle_ws_message(self, message_type, data):
        """Handle messages from WebSocket server"""
        if message_type == 'reload_encodings':
            logger.info("Reloading employee encodings...")
            self.request_employee_data()

    def run(self):
        """Main processing loop"""
        try:
            logger.info("Starting main processing loop...")

            while self.is_running:
                self.frame_count += 1

                # Read frame from camera
                try:
                    frame = self.camera.read_frame()
                except Exception as e:
                    logger.error(f"Failed to read frame: {str(e)}")
                    self.ws.send_error('CAMERA_ERROR', str(e))
                    time.sleep(1)
                    continue

                # Only process every Nth frame for performance
                if self.frame_count % Config.PROCESS_EVERY_N_FRAMES != 0:
                    continue

                # Detect faces
                face_locations = self.recognition.detect_faces(frame)

                if not face_locations:
                    # No face detected - don't spam messages
                    continue

                # Process first detected face
                face_location = face_locations[0]

                # Generate face encoding
                face_encoding = self.recognition.encode_face(frame, face_location)

                if face_encoding is None:
                    logger.warning("Failed to generate face encoding")
                    continue

                # Match face against employee database
                match_result = self.recognition.match_face(face_encoding)

                if match_result:
                    if match_result['employee_id']:
                        # Known employee detected
                        logger.info(f"✅ Match: {match_result['employee_name']} "
                                   f"(confidence: {match_result['confidence_score']})")

                        self.ws.send_face_detected(
                            employee_id=match_result['employee_id'],
                            employee_name=match_result['employee_name'],
                            confidence_score=match_result['confidence_score'],
                            face_location=face_location
                        )

                    else:
                        # Unknown face (below threshold)
                        logger.info(f"⚠️ Unknown face detected "
                                   f"(confidence: {match_result['confidence_score']})")

                        self.ws.send_unknown_face(
                            confidence_score=match_result['confidence_score'],
                            face_location=face_location
                        )

                # Send periodic status updates (every 10 seconds)
                if time.time() - self.last_status_time > 10:
                    self.send_status()
                    self.last_status_time = time.time()

        except Exception as e:
            logger.error(f"Error in main loop: {str(e)}")
            self.ws.send_error('PROCESSING_ERROR', str(e))
            raise

    def send_status(self):
        """Send status update to server"""
        camera_info = self.camera.get_info()
        recognition_stats = self.recognition.get_stats()

        self.ws.send_status({
            'status': 'running',
            'camera_active': self.camera.is_available(),
            'fps': camera_info.get('fps', 0) if camera_info else 0,
            'loaded_employees': recognition_stats.get('loaded_employees', 0),
            'frame_count': self.frame_count,
            'uptime': time.time()
        })

    def shutdown(self):
        """Graceful shutdown"""
        logger.info("Shutting down Apollo AI Engine...")
        self.is_running = False

        if self.camera:
            self.camera.release()

        if self.ws:
            self.ws.close()

        logger.info("Apollo AI Engine shut down successfully")


# Global engine instance
engine = None


def signal_handler(sig, frame):
    """Handle shutdown signals"""
    logger.info("Shutdown signal received")
    if engine:
        engine.shutdown()
    sys.exit(0)


def main():
    """Main entry point"""
    global engine

    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # Create and initialize engine
        engine = ApolloAIEngine()
        engine.initialize()

        # Run main loop
        engine.run()

    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
        if engine:
            engine.shutdown()

    except Exception as e:
        logger.error(f"Fatal error: {str(e)}", exc_info=True)
        if engine:
            engine.shutdown()
        sys.exit(1)


if __name__ == '__main__':
    import os  # Add missing import
    main()
