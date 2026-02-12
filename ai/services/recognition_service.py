"""
Face Recognition Service
Handles face detection, encoding, and matching with employee database
"""

import face_recognition
import numpy as np
import logging
from datetime import datetime, timedelta
from config import Config

logger = logging.getLogger(__name__)


class RecognitionService:
    """Face recognition and matching service"""

    def __init__(self):
        self.employee_data = []  # List of {id, name, encodings: [[128], [128], ...]}
        self.cooldown_tracker = {}  # {employee_id: last_detection_time}

    def load_employees(self, employees):
        """Load employee data with face encodings from server"""
        try:
            self.employee_data = []

            for employee in employees:
                # Extract encodings from JSONB format
                encodings_data = employee.get('face_encodings', {})
                encodings = encodings_data.get('encodings', [])

                if not encodings:
                    logger.warning(f"No encodings found for employee {employee.get('name')}")
                    continue

                # Convert to numpy arrays
                np_encodings = [np.array(enc, dtype=np.float64) for enc in encodings]

                self.employee_data.append({
                    'id': employee['id'],
                    'name': employee['name'],
                    'email': employee.get('email', ''),
                    'encodings': np_encodings
                })

            logger.info(f"Loaded {len(self.employee_data)} employees with face encodings")

        except Exception as e:
            logger.error(f"Failed to load employees: {str(e)}")
            raise

    def detect_faces(self, frame):
        """Detect faces in frame and return locations"""
        try:
            # Convert BGR (OpenCV) to RGB (face_recognition)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if len(frame.shape) == 3 else frame

            # Detect face locations using HOG model (faster)
            face_locations = face_recognition.face_locations(
                rgb_frame,
                model=Config.FACE_DETECTION_MODEL
            )

            return face_locations

        except Exception as e:
            logger.error(f"Face detection error: {str(e)}")
            return []

    def encode_face(self, frame, face_location):
        """Generate face encoding for a detected face"""
        try:
            # Convert BGR to RGB
            rgb_frame = frame[:, :, ::-1]

            # Generate encoding
            encodings = face_recognition.face_encodings(rgb_frame, [face_location])

            if encodings:
                return encodings[0]

            return None

        except Exception as e:
            logger.error(f"Face encoding error: {str(e)}")
            return None

    def match_face(self, face_encoding):
        """Match detected face against employee database"""
        if not self.employee_data:
            logger.warning("No employee data loaded")
            return None

        best_match = None
        best_confidence = 0.0

        for employee in self.employee_data:
            # Compare with all encodings for this employee (3-5 photos)
            distances = face_recognition.face_distance(
                employee['encodings'],
                face_encoding
            )

            # Get best (minimum) distance
            min_distance = np.min(distances)

            # Convert distance to confidence (0-1 scale)
            confidence = 1.0 - min_distance

            # Check if this is the best match so far
            if confidence > best_confidence:
                best_confidence = confidence
                best_match = employee

        # Check if confidence meets threshold
        if best_confidence >= Config.CONFIDENCE_THRESHOLD:
            # Check cooldown period
            if self.is_in_cooldown(best_match['id']):
                logger.info(f"Employee {best_match['name']} is in cooldown period, skipping")
                return None

            # Update cooldown tracker
            self.update_cooldown(best_match['id'])

            return {
                'employee_id': best_match['id'],
                'employee_name': best_match['name'],
                'confidence_score': round(float(best_confidence), 4)
            }

        # No match above threshold
        return {
            'employee_id': None,
            'employee_name': None,
            'confidence_score': round(float(best_confidence), 4)
        }

    def is_in_cooldown(self, employee_id):
        """Check if employee is in cooldown period"""
        if employee_id not in self.cooldown_tracker:
            return False

        last_detection = self.cooldown_tracker[employee_id]
        cooldown_expires = last_detection + timedelta(minutes=Config.RECOGNITION_COOLDOWN_MINUTES)

        return datetime.now() < cooldown_expires

    def update_cooldown(self, employee_id):
        """Update cooldown tracker for employee"""
        self.cooldown_tracker[employee_id] = datetime.now()

    def get_stats(self):
        """Get recognition service statistics"""
        return {
            'loaded_employees': len(self.employee_data),
            'active_cooldowns': len([
                eid for eid, time in self.cooldown_tracker.items()
                if datetime.now() < time + timedelta(minutes=Config.RECOGNITION_COOLDOWN_MINUTES)
            ]),
            'confidence_threshold': Config.CONFIDENCE_THRESHOLD,
            'cooldown_minutes': Config.RECOGNITION_COOLDOWN_MINUTES
        }


# Import cv2 for color conversion
import cv2
