from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone
import os
import uuid
import json

# Load environment variables
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(title="SwiftScooty - Two Wheeler Taxi & Delivery API")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB Configuration
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'swiftscooty')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Pydantic Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    phone: str
    role: Literal["customer", "driver", "admin"]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_verified: bool = False
    
class DriverProfile(BaseModel):
    user_id: str
    license_number: str
    vehicle_type: Literal["bike", "scooter"]
    vehicle_number: str
    is_verified: bool = False
    is_available: bool = False
    current_location: Optional[dict] = None
    rating: float = 4.5

class RideBooking(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    driver_id: Optional[str] = None
    pickup_location: dict
    drop_location: dict
    vehicle_type: Literal["bike", "scooter"]
    status: Literal["pending", "accepted", "in_progress", "completed", "cancelled"] = "pending"
    fare: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
class DeliveryBooking(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    driver_id: Optional[str] = None
    pickup_location: dict
    drop_location: dict
    package_weight: float  # in kg
    package_description: str
    receiver_name: str
    receiver_phone: str
    status: Literal["pending", "accepted", "picked_up", "in_transit", "delivered", "cancelled"] = "pending"
    fare: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LocationUpdate(BaseModel):
    driver_id: str
    latitude: float
    longitude: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Rating(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    booking_id: str
    booking_type: Literal["ride", "delivery"]
    customer_id: str
    driver_id: str
    rating: int = Field(ge=1, le=5)  # Rating between 1-5 stars
    review_text: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OTPVerification(BaseModel):
    phone_number: str
    otp_code: str
    user_id: str

class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    booking_id: str
    sender_id: str
    sender_type: Literal["customer", "driver"]
    message_text: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_read: bool = False

# Authentication (Mock implementation)
async def get_current_user(user_id: str = None):
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return User(**user)

# Utility Functions
def calculate_fare(distance_km: float, service_type: str) -> float:
    """Mock fare calculation based on distance and service type"""
    base_fare = 20.0  # Base fare in INR
    
    if service_type == "ride":
        per_km_rate = 8.0
    else:  # delivery
        per_km_rate = 12.0
    
    return base_fare + (distance_km * per_km_rate)

def calculate_distance(pickup: dict, drop: dict) -> float:
    """Mock distance calculation - returns random distance between 2-15 km"""
    import random
    return round(random.uniform(2.0, 15.0), 1)

# API Routes

@app.get("/")
async def root():
    return {"message": "SwiftScooty API - Two Wheeler Taxi & Delivery Service for Northeast India"}

@app.get("/api/")
async def api_root():
    return {"message": "SwiftScooty API - Two Wheeler Taxi & Delivery Service for Northeast India"}

# User Management
@app.post("/api/auth/register", response_model=User)
async def register_user(user_data: dict):
    user = User(
        name=user_data["name"],
        email=user_data["email"], 
        phone=user_data["phone"],
        role=user_data.get("role", "customer")
    )
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")
    
    user_dict = user.dict()
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    
    await db.users.insert_one(user_dict)
    return user

@app.post("/api/auth/login")
async def login_user(credentials: dict):
    user = await db.users.find_one({"email": credentials["email"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Mock authentication - in real app, verify password
    return {
        "user": User(**user),
        "token": f"mock_token_{user['id']}",  # Mock JWT token
        "message": "Login successful"
    }

@app.get("/api/users/{user_id}", response_model=User)
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return User(**user)

# Driver Management
@app.post("/api/drivers/register")
async def register_driver(driver_data: dict):
    # First check if user exists and is a driver
    user = await db.users.find_one({"id": driver_data["user_id"]})
    if not user or user["role"] != "driver":
        raise HTTPException(status_code=400, detail="Invalid driver user")
    
    driver_profile = DriverProfile(
        user_id=driver_data["user_id"],
        license_number=driver_data["license_number"],
        vehicle_type=driver_data["vehicle_type"],
        vehicle_number=driver_data["vehicle_number"]
    )
    
    profile_dict = driver_profile.dict()
    await db.driver_profiles.insert_one(profile_dict)
    
    return {"message": "Driver registered successfully", "profile": driver_profile}

@app.get("/api/drivers/available")
async def get_available_drivers(vehicle_type: Optional[str] = None):
    query = {"is_available": True}
    if vehicle_type:
        query["vehicle_type"] = vehicle_type
    
    drivers = await db.driver_profiles.find(query).to_list(length=None)
    return [DriverProfile(**driver) for driver in drivers]

@app.patch("/api/drivers/{driver_id}/availability")
async def update_driver_availability(driver_id: str, availability: dict):
    result = await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"is_available": availability["available"]}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    return {"message": "Availability updated"}

# Ride Booking
@app.post("/api/rides/book", response_model=RideBooking)
async def book_ride(booking_data: dict):
    distance = calculate_distance(booking_data["pickup_location"], booking_data["drop_location"])
    fare = calculate_fare(distance, "ride")
    
    ride = RideBooking(
        customer_id=booking_data["customer_id"],
        pickup_location=booking_data["pickup_location"],
        drop_location=booking_data["drop_location"],
        vehicle_type=booking_data["vehicle_type"],
        fare=fare
    )
    
    ride_dict = ride.dict()
    ride_dict["created_at"] = ride_dict["created_at"].isoformat()
    
    await db.ride_bookings.insert_one(ride_dict)
    
    return ride

@app.get("/api/rides/customer/{customer_id}")
async def get_customer_rides(customer_id: str):
    rides = await db.ride_bookings.find({"customer_id": customer_id}).to_list(length=None)
    return [RideBooking(**ride) for ride in rides]

@app.get("/api/rides/driver/{driver_id}")
async def get_driver_rides(driver_id: str):
    rides = await db.ride_bookings.find({"driver_id": driver_id}).to_list(length=None)
    return [RideBooking(**ride) for ride in rides]

@app.patch("/api/rides/{ride_id}/accept")
async def accept_ride(ride_id: str, driver_data: dict):
    result = await db.ride_bookings.update_one(
        {"id": ride_id, "status": "pending"},
        {"$set": {"driver_id": driver_data["driver_id"], "status": "accepted"}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Ride not found or already accepted")
    
    return {"message": "Ride accepted successfully"}

# Delivery Booking
@app.post("/api/deliveries/book", response_model=DeliveryBooking)
async def book_delivery(booking_data: dict):
    # Validate package weight
    if booking_data["package_weight"] > 10:
        raise HTTPException(status_code=400, detail="Package weight exceeds 10kg limit")
    
    distance = calculate_distance(booking_data["pickup_location"], booking_data["drop_location"])
    fare = calculate_fare(distance, "delivery")
    
    delivery = DeliveryBooking(
        customer_id=booking_data["customer_id"],
        pickup_location=booking_data["pickup_location"],
        drop_location=booking_data["drop_location"],
        package_weight=booking_data["package_weight"],
        package_description=booking_data["package_description"],
        receiver_name=booking_data["receiver_name"],
        receiver_phone=booking_data["receiver_phone"],
        fare=fare
    )
    
    delivery_dict = delivery.dict()
    delivery_dict["created_at"] = delivery_dict["created_at"].isoformat()
    
    await db.delivery_bookings.insert_one(delivery_dict)
    
    return delivery

@app.get("/api/deliveries/customer/{customer_id}")
async def get_customer_deliveries(customer_id: str):
    deliveries = await db.delivery_bookings.find({"customer_id": customer_id}).to_list(length=None)
    return [DeliveryBooking(**delivery) for delivery in deliveries]

@app.patch("/api/deliveries/{delivery_id}/accept")
async def accept_delivery(delivery_id: str, driver_data: dict):
    result = await db.delivery_bookings.update_one(
        {"id": delivery_id, "status": "pending"},
        {"$set": {"driver_id": driver_data["driver_id"], "status": "accepted"}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Delivery not found or already accepted")
    
    return {"message": "Delivery accepted successfully"}

# Live Tracking (Mock Implementation)
@app.post("/api/tracking/update-location")
async def update_driver_location(location_data: dict):
    """**MOCKED** - Will be enhanced with Google Maps integration"""
    
    location = LocationUpdate(
        driver_id=location_data["driver_id"],
        latitude=location_data["latitude"],
        longitude=location_data["longitude"]
    )
    
    location_dict = location.dict()
    location_dict["timestamp"] = location_dict["timestamp"].isoformat()
    
    # Store location update
    await db.location_updates.insert_one(location_dict)
    
    # Update driver's current location
    await db.driver_profiles.update_one(
        {"user_id": location_data["driver_id"]},
        {"$set": {"current_location": {"lat": location_data["latitude"], "lng": location_data["longitude"]}}}
    )
    
    return {"message": "Location updated successfully", "mock": True}

@app.get("/api/tracking/{booking_id}/{booking_type}")
async def track_booking(booking_id: str, booking_type: Literal["ride", "delivery"]):
    """**MOCKED** - Will be enhanced with Google Maps integration"""
    
    collection = f"{booking_type}_bookings"
    booking = await db[collection].find_one({"id": booking_id})
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Mock live tracking data
    mock_tracking = {
        "booking_id": booking_id,
        "status": booking["status"],
        "driver_location": {
            "lat": 25.5788 + (hash(booking_id) % 100) / 10000,  # Mock location near Shillong
            "lng": 91.8933 + (hash(booking_id) % 100) / 10000
        },
        "estimated_arrival": "15 minutes",
        "distance_remaining": "3.2 km",
        "mock": True
    }
    
    return mock_tracking

# Razorpay Integration
import razorpay
import hmac
import hashlib

# Initialize Razorpay client
RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET')

if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
else:
    razorpay_client = None

class PaymentOrder(BaseModel):
    amount: int  # Amount in paise (INR)
    currency: str = "INR"
    receipt: str
    booking_id: str
    customer_id: str

class PaymentVerification(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    booking_id: str

@app.post("/api/payments/create-order")
async def create_payment_order(payment_order: PaymentOrder):
    """Create Razorpay payment order"""
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Payment service not configured")
    
    try:
        # Create order with Razorpay
        order_data = {
            "amount": payment_order.amount,  # Amount in paise
            "currency": payment_order.currency,
            "receipt": payment_order.receipt,
            "payment_capture": 1  # Auto capture payment
        }
        
        razorpay_order = razorpay_client.order.create(data=order_data)
        
        # Store order details in database
        order_record = {
            "order_id": razorpay_order["id"],
            "booking_id": payment_order.booking_id,
            "customer_id": payment_order.customer_id,
            "amount": payment_order.amount,
            "currency": payment_order.currency,
            "status": "created",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.payment_orders.insert_one(order_record)
        
        return {
            "order_id": razorpay_order["id"],
            "amount": razorpay_order["amount"],
            "currency": razorpay_order["currency"],
            "key_id": RAZORPAY_KEY_ID,
            "status": "created"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create payment order: {str(e)}")

@app.post("/api/payments/verify")
async def verify_payment(payment_verification: PaymentVerification):
    """Verify Razorpay payment signature"""
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Payment service not configured")
    
    try:
        # Verify signature
        params_dict = {
            'razorpay_order_id': payment_verification.razorpay_order_id,
            'razorpay_payment_id': payment_verification.razorpay_payment_id,
            'razorpay_signature': payment_verification.razorpay_signature
        }
        
        razorpay_client.utility.verify_payment_signature(params_dict)
        
        # Update payment status in database
        payment_record = {
            "order_id": payment_verification.razorpay_order_id,
            "payment_id": payment_verification.razorpay_payment_id,
            "signature": payment_verification.razorpay_signature,
            "booking_id": payment_verification.booking_id,
            "status": "completed",
            "verified_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.payments.insert_one(payment_record)
        
        # Update booking status
        await db.ride_bookings.update_one(
            {"id": payment_verification.booking_id},
            {"$set": {"payment_status": "completed", "status": "confirmed"}}
        )
        
        await db.delivery_bookings.update_one(
            {"id": payment_verification.booking_id},
            {"$set": {"payment_status": "completed", "status": "confirmed"}}
        )
        
        return {
            "status": "success",
            "message": "Payment verified successfully",
            "payment_id": payment_verification.razorpay_payment_id
        }
        
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment verification failed: {str(e)}")

@app.post("/api/payments/webhook")
async def razorpay_webhook(request: dict):
    """Handle Razorpay webhook events"""
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Payment service not configured")
    
    try:
        # Verify webhook signature (recommended for production)
        # webhook_signature = request.headers.get('X-Razorpay-Signature')
        # razorpay_client.utility.verify_webhook_signature(request.body, webhook_signature, webhook_secret)
        
        event = request.get('event')
        payload = request.get('payload', {}).get('payment', {}).get('entity', {})
        
        if event == 'payment.captured':
            # Payment successful
            payment_id = payload.get('id')
            order_id = payload.get('order_id')
            amount = payload.get('amount')
            
            # Update payment status
            await db.payments.update_one(
                {"order_id": order_id},
                {"$set": {"status": "captured", "captured_at": datetime.now(timezone.utc).isoformat()}}
            )
            
        elif event == 'payment.failed':
            # Payment failed
            payment_id = payload.get('id')
            order_id = payload.get('order_id')
            error_code = payload.get('error_code')
            error_description = payload.get('error_description')
            
            # Update payment status
            await db.payments.update_one(
                {"order_id": order_id},
                {"$set": {
                    "status": "failed",
                    "error_code": error_code,
                    "error_description": error_description,
                    "failed_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        return {"status": "ok"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {str(e)}")

# Admin Dashboard
@app.get("/api/admin/stats")
async def get_admin_stats():
    total_users = await db.users.count_documents({})
    total_drivers = await db.driver_profiles.count_documents({})
    total_rides = await db.ride_bookings.count_documents({})
    total_deliveries = await db.delivery_bookings.count_documents({})
    
    return {
        "total_users": total_users,
        "total_drivers": total_drivers,
        "total_rides": total_rides,
        "total_deliveries": total_deliveries,
        "active_drivers": await db.driver_profiles.count_documents({"is_available": True})
    }

@app.get("/api/admin/drivers")
async def get_all_drivers():
    drivers = await db.driver_profiles.find().to_list(length=None)
    
    # Get user info for each driver
    for driver in drivers:
        user = await db.users.find_one({"id": driver["user_id"]})
        driver["user_info"] = User(**user) if user else None
    
    return drivers

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)