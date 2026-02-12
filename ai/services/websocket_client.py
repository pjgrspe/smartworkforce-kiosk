"""
WebSocket Client Service
Handles WebSocket communication with Node.js server
"""

import websocket
import json
import logging
import time
import threading
from datetime import datetime
from config import Config

logger = logging.getLogger(__name__)


class WebSocketClient:
    """WebSocket client for communicating with Node.js server"""

    def __init__(self, on_message_callback=None):
        self.ws = None
        self.url = Config.WS_URL
        self.is_connected = False
        self.should_reconnect = True
        self.reconnect_delay = 1  # Start with 1 second
        self.max_reconnect_delay = 30  # Max 30 seconds
        self.on_message_callback = on_message_callback
        self.connection_thread = None

    def connect(self):
        """Connect to WebSocket server"""
        try:
            logger.info(f"Connecting to WebSocket server at {self.url}...")

            self.ws = websocket.WebSocketApp(
                self.url,
                on_open=self.on_open,
                on_message=self.on_message,
                on_error=self.on_error,
                on_close=self.on_close
            )

            # Run in separate thread
            self.connection_thread = threading.Thread(target=self.ws.run_forever)
            self.connection_thread.daemon = True
            self.connection_thread.start()

        except Exception as e:
            logger.error(f"Failed to connect to WebSocket server: {str(e)}")
            self.schedule_reconnect()

    def on_open(self, ws):
        """Handle WebSocket connection opened"""
        logger.info("✅ Connected to WebSocket server")
        self.is_connected = True
        self.reconnect_delay = 1  # Reset reconnect delay

        # Identify as AI engine
        self.send({
            'type': 'IDENTIFY',
            'clientType': 'ai-engine',
            'metadata': {
                'version': '1.0.0',
                'platform': 'windows'
            }
        })

    def on_message(self, ws, message):
        """Handle incoming WebSocket message"""
        try:
            data = json.loads(message)
            logger.debug(f"Received message: {data.get('type')}")

            # Handle specific message types
            if data.get('type') == 'RELOAD_ENCODINGS':
                logger.info("Received RELOAD_ENCODINGS command")
                if self.on_message_callback:
                    self.on_message_callback('reload_encodings', data)

            elif data.get('type') == 'PING':
                # Respond to ping
                self.send({'type': 'PONG', 'timestamp': datetime.now().isoformat()})

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse WebSocket message: {str(e)}")
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {str(e)}")

    def on_error(self, ws, error):
        """Handle WebSocket error"""
        logger.error(f"WebSocket error: {str(error)}")

    def on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket connection closed"""
        logger.warning(f"WebSocket connection closed: {close_status_code} - {close_msg}")
        self.is_connected = False

        if self.should_reconnect:
            self.schedule_reconnect()

    def schedule_reconnect(self):
        """Schedule reconnection attempt"""
        logger.info(f"Reconnecting in {self.reconnect_delay} seconds...")

        time.sleep(self.reconnect_delay)

        # Exponential backoff
        self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)

        if self.should_reconnect:
            self.connect()

    def send(self, data):
        """Send message to WebSocket server"""
        if not self.is_connected or not self.ws:
            logger.warning("Cannot send message: not connected")
            return False

        try:
            # Add timestamp if not present
            if 'timestamp' not in data:
                data['timestamp'] = datetime.now().isoformat()

            message = json.dumps(data)
            self.ws.send(message)
            logger.debug(f"Sent message: {data.get('type')}")
            return True

        except Exception as e:
            logger.error(f"Failed to send message: {str(e)}")
            return False

    def send_face_detected(self, employee_id, employee_name, confidence_score, face_location=None):
        """Send FACE_DETECTED event"""
        return self.send({
            'type': 'FACE_DETECTED',
            'data': {
                'employee_id': employee_id,
                'employee_name': employee_name,
                'confidence_score': confidence_score,
                'face_location': face_location
            }
        })

    def send_unknown_face(self, confidence_score, face_location=None):
        """Send UNKNOWN_FACE event"""
        return self.send({
            'type': 'UNKNOWN_FACE',
            'data': {
                'confidence_score': confidence_score,
                'face_location': face_location
            }
        })

    def send_no_face(self):
        """Send NO_FACE_DETECTED event"""
        return self.send({
            'type': 'NO_FACE_DETECTED'
        })

    def send_error(self, error_code, error_message, details=None):
        """Send ERROR event"""
        return self.send({
            'type': 'ERROR',
            'error': {
                'code': error_code,
                'message': error_message,
                'details': details
            }
        })

    def send_status(self, status_data):
        """Send STATUS event"""
        return self.send({
            'type': 'STATUS',
            'data': status_data
        })

    def close(self):
        """Close WebSocket connection"""
        logger.info("Closing WebSocket connection...")
        self.should_reconnect = False
        self.is_connected = False

        if self.ws:
            self.ws.close()

    def wait_for_connection(self, timeout=10):
        """Wait for WebSocket connection to be established"""
        start_time = time.time()

        while not self.is_connected:
            if time.time() - start_time > timeout:
                logger.error("Connection timeout")
                return False

            time.sleep(0.1)

        return True
