import React, { useState, useEffect, useContext, createContext } from 'react';
import './App.css';

// Context for user authentication
const AuthContext = createContext();

// Mock Google Maps Component
const MockGoogleMap = ({ locations, onLocationSelect, showRoute = false }) => {
  return (
    <div className="mock-map" data-testid="google-map">
      <div className="map-header">
        <span className="map-title">🗺️ Google Maps (Will be integrated)</span>
        <span className="map-status">Ready for API integration</span>
      </div>
      <div className="map-content">
        <div className="location-pins">
          {locations.map((loc, index) => (
            <div key={index} className="map-pin" style={{
              left: `${20 + index * 30}%`,
              top: `${30 + index * 20}%`
            }}>
              📍 {loc.name}
            </div>
          ))}
        </div>
        {showRoute && (
          <div className="route-line">
            <span>📍 ────────── 📍</span>
            <small>Route visualization</small>
          </div>
        )}
        <div className="map-controls">
          <button 
            data-testid="use-current-location-btn"
            onClick={() => onLocationSelect && onLocationSelect({ lat: 25.5788, lng: 91.8933 })}
          >
            📍 Use Current Location
          </button>
        </div>
      </div>
    </div>
  );
};

// Razorpay Payment Component
const RazorpayPayment = ({ booking, onPaymentComplete, onPaymentCancel }) => {
  const [loading, setLoading] = useState(false);

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    setLoading(true);
    
    try {
      // Load Razorpay script
      const isLoaded = await loadRazorpay();
      if (!isLoaded) {
        alert('Razorpay SDK failed to load. Please check your connection.');
        setLoading(false);
        return;
      }

      // Create payment order
      const orderResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(booking.fare * 100), // Convert to paise
          currency: 'INR',
          receipt: `receipt_${booking.id}`,
          booking_id: booking.id,
          customer_id: booking.customer_id
        })
      });

      const orderData = await orderResponse.json();

      // Configure Razorpay options
      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'SwiftScooty',
        description: `${booking.type === 'ride' ? 'Ride' : 'Delivery'} Payment`,
        order_id: orderData.order_id,
        handler: async (response) => {
          try {
            // Verify payment
            const verifyResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/payments/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                booking_id: booking.id
              })
            });

            const verifyData = await verifyResponse.json();
            
            if (verifyData.status === 'success') {
              onPaymentComplete({
                payment_id: response.razorpay_payment_id,
                order_id: response.razorpay_order_id,
                amount: booking.fare,
                status: 'success'
              });
            } else {
              alert('Payment verification failed');
            }
          } catch (error) {
            console.error('Payment verification error:', error);
            alert('Payment verification failed');
          }
        },
        prefill: {
          name: booking.customer_name || '',
          email: booking.customer_email || '',
          contact: booking.customer_phone || ''
        },
        theme: {
          color: '#667eea'
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
      
    } catch (error) {
      console.error('Payment error:', error);
      alert('Payment initialization failed');
    }
    
    setLoading(false);
  };

  return (
    <div className="payment-gateway" data-testid="razorpay-gateway">
      <div className="payment-header">
        <h3>💳 Secure Payment with Razorpay</h3>
        <p data-testid="payment-amount">Amount: ₹{booking.fare}</p>
        <p className="payment-description">
          Payment for {booking.type === 'ride' ? 'ride' : 'delivery'} from{' '}
          {booking.pickup_location.name} to {booking.drop_location.name}
        </p>
      </div>
      
      <div className="payment-methods">
        <h4>Supported Payment Methods:</h4>
        <div className="method-icons">
          <span>💳 Cards</span>
          <span>📱 UPI</span>
          <span>🏦 Net Banking</span>
          <span>💰 Wallets</span>
        </div>
      </div>

      <div className="payment-actions">
        <button 
          className="btn btn-primary" 
          onClick={handlePayment}
          disabled={loading}
          data-testid="pay-with-razorpay-btn"
        >
          {loading ? 'Initializing...' : `Pay ₹${booking.fare}`}
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={onPaymentCancel}
          data-testid="cancel-payment-btn"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// Auth Provider Component
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = async (email, password, role = 'customer') => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role })
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.token);
        return true;
      }
    } catch (error) {
      console.error('Login error:', error);
    }
    setLoading(false);
    return false;
  };

  const register = async (userData) => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data);
        localStorage.setItem('user', JSON.stringify(data));
        return true;
      }
    } catch (error) {
      console.error('Registration error:', error);
    }
    setLoading(false);
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Login/Register Component
const AuthForm = () => {
  const { login, register, loading } = useContext(AuthContext);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    role: 'customer'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    let success = false;
    if (isLogin) {
      success = await login(formData.email, formData.password, formData.role);
    } else {
      success = await register(formData);
    }
    
    if (!success) {
      alert(isLogin ? 'Login failed' : 'Registration failed');
    }
  };

  return (
    <div className="auth-container" data-testid="auth-form">
      <div className="auth-form">
        <h2>🛵 SwiftScooty</h2>
        <p>Two Wheeler Taxi & Delivery Service</p>
        
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <input
                type="text"
                placeholder="Full Name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                data-testid="name-input"
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                required
                data-testid="phone-input"
              />
            </>
          )}
          
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            required
            data-testid="email-input"
          />
          
          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
            required
            data-testid="password-input"
          />
          
          <select
            value={formData.role}
            onChange={(e) => setFormData({...formData, role: e.target.value})}
            data-testid="role-select"
          >
            <option value="customer">Customer</option>
            <option value="driver">Driver</option>
            <option value="admin">Admin</option>
          </select>
          
          <button 
            type="submit" 
            disabled={loading}
            data-testid={isLogin ? "login-button" : "register-button"}
          >
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>
        
        <p>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span 
            className="auth-toggle"
            onClick={() => setIsLogin(!isLogin)}
            data-testid="auth-toggle"
          >
            {isLogin ? 'Register' : 'Login'}
          </span>
        </p>
      </div>
    </div>
  );
};

// Customer Dashboard
const CustomerDashboard = () => {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('book-ride');
  const [bookings, setBookings] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [currentBooking, setCurrentBooking] = useState(null);

  // Booking Form States
  const [rideForm, setRideForm] = useState({
    pickup_location: { name: '', lat: 0, lng: 0 },
    drop_location: { name: '', lat: 0, lng: 0 },
    vehicle_type: 'bike'
  });

  const [deliveryForm, setDeliveryForm] = useState({
    pickup_location: { name: '', lat: 0, lng: 0 },
    drop_location: { name: '', lat: 0, lng: 0 },
    package_weight: '',
    package_description: '',
    receiver_name: '',
    receiver_phone: ''
  });

  const bookRide = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/rides/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rideForm,
          customer_id: user.id
        })
      });
      
      if (response.ok) {
        const booking = await response.json();
        setCurrentBooking({ ...booking, type: 'ride' });
        setShowPayment(true);
      }
    } catch (error) {
      console.error('Booking error:', error);
    }
  };

  const bookDelivery = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/deliveries/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...deliveryForm,
          customer_id: user.id
        })
      });
      
      if (response.ok) {
        const booking = await response.json();
        setCurrentBooking({ ...booking, type: 'delivery' });
        setShowPayment(true);
      }
    } catch (error) {
      console.error('Booking error:', error);
    }
  };

  const handlePaymentComplete = (paymentData) => {
    setShowPayment(false);
    alert(`Payment successful! Booking ID: ${currentBooking.id}`);
    fetchBookings();
  };

  const fetchBookings = async () => {
    try {
      const [ridesResponse, deliveriesResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/rides/customer/${user.id}`),
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/deliveries/customer/${user.id}`)
      ]);
      
      const rides = await ridesResponse.json();
      const deliveries = await deliveriesResponse.json();
      
      setBookings([
        ...rides.map(r => ({ ...r, type: 'ride' })),
        ...deliveries.map(d => ({ ...d, type: 'delivery' }))
      ]);
    } catch (error) {
      console.error('Fetch bookings error:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBookings();
    }
  }, [user]);

  if (showPayment) {
    return (
      <MockPaymentGateway
        amount={currentBooking.fare}
        onPaymentComplete={handlePaymentComplete}
        onPaymentCancel={() => setShowPayment(false)}
      />
    );
  }

  return (
    <div className="dashboard" data-testid="customer-dashboard">
      <div className="dashboard-header">
        <h2>Welcome, {user?.name}!</h2>
        <div className="tab-buttons">
          <button 
            className={activeTab === 'book-ride' ? 'active' : ''}
            onClick={() => setActiveTab('book-ride')}
            data-testid="book-ride-tab"
          >
            🏍️ Book Ride
          </button>
          <button 
            className={activeTab === 'book-delivery' ? 'active' : ''}
            onClick={() => setActiveTab('book-delivery')}
            data-testid="book-delivery-tab"
          >
            📦 Book Delivery
          </button>
          <button 
            className={activeTab === 'my-bookings' ? 'active' : ''}
            onClick={() => setActiveTab('my-bookings')}
            data-testid="my-bookings-tab"
          >
            📋 My Bookings
          </button>
        </div>
      </div>

      {activeTab === 'book-ride' && (
        <div className="booking-form" data-testid="ride-booking-form">
          <h3>Book a Ride</h3>
          
          <MockGoogleMap
            locations={[
              { name: 'Pickup', ...rideForm.pickup_location },
              { name: 'Drop', ...rideForm.drop_location }
            ]}
            onLocationSelect={(location) => {
              // Handle location selection
            }}
            showRoute={true}
          />
          
          <div className="form-group">
            <label>Pickup Location</label>
            <input
              type="text"
              placeholder="Enter pickup location"
              value={rideForm.pickup_location.name}
              onChange={(e) => setRideForm({
                ...rideForm,
                pickup_location: { ...rideForm.pickup_location, name: e.target.value }
              })}
              data-testid="pickup-location-input"
            />
          </div>
          
          <div className="form-group">
            <label>Drop Location</label>
            <input
              type="text"
              placeholder="Enter drop location"
              value={rideForm.drop_location.name}
              onChange={(e) => setRideForm({
                ...rideForm,
                drop_location: { ...rideForm.drop_location, name: e.target.value }
              })}
              data-testid="drop-location-input"
            />
          </div>
          
          <div className="form-group">
            <label>Vehicle Type</label>
            <select
              value={rideForm.vehicle_type}
              onChange={(e) => setRideForm({...rideForm, vehicle_type: e.target.value})}
              data-testid="vehicle-type-select"
            >
              <option value="bike">Bike</option>
              <option value="scooter">Scooter</option>
            </select>
          </div>
          
          <button 
            className="btn btn-primary" 
            onClick={bookRide}
            data-testid="book-ride-button"
          >
            Book Ride
          </button>
        </div>
      )}

      {activeTab === 'book-delivery' && (
        <div className="booking-form" data-testid="delivery-booking-form">
          <h3>Book a Delivery</h3>
          
          <MockGoogleMap
            locations={[
              { name: 'Pickup', ...deliveryForm.pickup_location },
              { name: 'Drop', ...deliveryForm.drop_location }
            ]}
            showRoute={true}
          />
          
          <div className="form-row">
            <div className="form-group">
              <label>Pickup Location</label>
              <input
                type="text"
                placeholder="Enter pickup location"
                value={deliveryForm.pickup_location.name}
                onChange={(e) => setDeliveryForm({
                  ...deliveryForm,
                  pickup_location: { ...deliveryForm.pickup_location, name: e.target.value }
                })}
                data-testid="delivery-pickup-input"
              />
            </div>
            
            <div className="form-group">
              <label>Drop Location</label>
              <input
                type="text"
                placeholder="Enter drop location"
                value={deliveryForm.drop_location.name}
                onChange={(e) => setDeliveryForm({
                  ...deliveryForm,
                  drop_location: { ...deliveryForm.drop_location, name: e.target.value }
                })}
                data-testid="delivery-drop-input"
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Package Weight (kg)</label>
              <input
                type="number"
                max="10"
                placeholder="Max 10 kg"
                value={deliveryForm.package_weight}
                onChange={(e) => setDeliveryForm({...deliveryForm, package_weight: e.target.value})}
                data-testid="package-weight-input"
              />
            </div>
            
            <div className="form-group">
              <label>Package Description</label>
              <input
                type="text"
                placeholder="Describe the package"
                value={deliveryForm.package_description}
                onChange={(e) => setDeliveryForm({...deliveryForm, package_description: e.target.value})}
                data-testid="package-description-input"
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Receiver Name</label>
              <input
                type="text"
                placeholder="Receiver's name"
                value={deliveryForm.receiver_name}
                onChange={(e) => setDeliveryForm({...deliveryForm, receiver_name: e.target.value})}
                data-testid="receiver-name-input"
              />
            </div>
            
            <div className="form-group">
              <label>Receiver Phone</label>
              <input
                type="tel"
                placeholder="Receiver's phone"
                value={deliveryForm.receiver_phone}
                onChange={(e) => setDeliveryForm({...deliveryForm, receiver_phone: e.target.value})}
                data-testid="receiver-phone-input"
              />
            </div>
          </div>
          
          <button 
            className="btn btn-primary" 
            onClick={bookDelivery}
            data-testid="book-delivery-button"
          >
            Book Delivery
          </button>
        </div>
      )}

      {activeTab === 'my-bookings' && (
        <div className="bookings-list" data-testid="bookings-list">
          <h3>My Bookings</h3>
          {bookings.length === 0 ? (
            <p data-testid="no-bookings-message">No bookings found.</p>
          ) : (
            bookings.map(booking => (
              <div key={booking.id} className="booking-card" data-testid={`booking-${booking.id}`}>
                <div className="booking-header">
                  <span className={`booking-type ${booking.type}`}>
                    {booking.type === 'ride' ? '🏍️' : '📦'} {booking.type}
                  </span>
                  <span className={`status ${booking.status}`} data-testid={`booking-status-${booking.status}`}>
                    {booking.status}
                  </span>
                </div>
                <div className="booking-details">
                  <p><strong>From:</strong> {booking.pickup_location.name}</p>
                  <p><strong>To:</strong> {booking.drop_location.name}</p>
                  <p><strong>Fare:</strong> ₹{booking.fare}</p>
                  <p><strong>Date:</strong> {new Date(booking.created_at).toLocaleDateString()}</p>
                </div>
                {booking.status !== 'completed' && (
                  <button 
                    className="btn btn-secondary"
                    data-testid={`track-booking-${booking.id}`}
                  >
                    Track Order
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// Driver Dashboard
const DriverDashboard = () => {
  const { user } = useContext(AuthContext);
  const [isAvailable, setIsAvailable] = useState(false);
  const [pendingJobs, setPendingJobs] = useState([]);
  const [myJobs, setMyJobs] = useState([]);
  const [driverProfile, setDriverProfile] = useState(null);

  const toggleAvailability = async () => {
    try {
      await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/drivers/${user.id}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: !isAvailable })
      });
      setIsAvailable(!isAvailable);
    } catch (error) {
      console.error('Error updating availability:', error);
    }
  };

  const acceptJob = async (jobId, jobType) => {
    try {
      const endpoint = jobType === 'ride' ? 'rides' : 'deliveries';
      await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/${endpoint}/${jobId}/accept`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: user.id })
      });
      
      alert('Job accepted successfully!');
      fetchJobs();
    } catch (error) {
      console.error('Error accepting job:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const [ridesResponse, deliveriesResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/rides/driver/${user.id}`),
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/deliveries/driver/${user.id}`)
      ]);
      
      const rides = await ridesResponse.json();
      const deliveries = await deliveriesResponse.json();
      
      setMyJobs([
        ...rides.map(r => ({ ...r, type: 'ride' })),
        ...deliveries.map(d => ({ ...d, type: 'delivery' }))
      ]);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchJobs();
    }
  }, [user]);

  return (
    <div className="dashboard" data-testid="driver-dashboard">
      <div className="dashboard-header">
        <h2>Driver Dashboard</h2>
        <div className="availability-toggle">
          <button 
            className={`availability-btn ${isAvailable ? 'online' : 'offline'}`}
            onClick={toggleAvailability}
            data-testid="availability-toggle"
          >
            {isAvailable ? '🟢 Online' : '🔴 Offline'}
          </button>
        </div>
      </div>

      <div className="driver-stats">
        <div className="stat-card">
          <h4>Today's Earnings</h4>
          <p data-testid="todays-earnings">₹450</p>
        </div>
        <div className="stat-card">
          <h4>Completed Jobs</h4>
          <p data-testid="completed-jobs">12</p>
        </div>
        <div className="stat-card">
          <h4>Rating</h4>
          <p data-testid="driver-rating">4.8 ⭐</p>
        </div>
      </div>

      <div className="jobs-section">
        <h3>My Jobs</h3>
        {myJobs.length === 0 ? (
          <p data-testid="no-jobs-message">No active jobs. Turn on availability to receive new jobs!</p>
        ) : (
          myJobs.map(job => (
            <div key={job.id} className="job-card" data-testid={`job-${job.id}`}>
              <div className="job-header">
                <span className={`job-type ${job.type}`}>
                  {job.type === 'ride' ? '🏍️' : '📦'} {job.type}
                </span>
                <span className={`status ${job.status}`}>{job.status}</span>
              </div>
              <div className="job-details">
                <p><strong>From:</strong> {job.pickup_location.name}</p>
                <p><strong>To:</strong> {job.drop_location.name}</p>
                <p><strong>Fare:</strong> ₹{job.fare}</p>
              </div>
              <div className="job-actions">
                <button 
                  className="btn btn-primary"
                  data-testid={`navigate-job-${job.id}`}
                >
                  Navigate
                </button>
                <button 
                  className="btn btn-secondary"
                  data-testid={`contact-customer-${job.id}`}
                >
                  Contact Customer
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Admin Dashboard
const AdminDashboard = () => {
  const [stats, setStats] = useState({});
  const [drivers, setDrivers] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchStats = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchDrivers = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/drivers`);
      const data = await response.json();
      setDrivers(data);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchDrivers();
  }, []);

  return (
    <div className="dashboard" data-testid="admin-dashboard">
      <div className="dashboard-header">
        <h2>Admin Dashboard</h2>
        <div className="tab-buttons">
          <button 
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => setActiveTab('overview')}
            data-testid="overview-tab"
          >
            📊 Overview
          </button>
          <button 
            className={activeTab === 'drivers' ? 'active' : ''}
            onClick={() => setActiveTab('drivers')}
            data-testid="drivers-tab"
          >
            👥 Drivers
          </button>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="admin-overview" data-testid="admin-overview">
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Total Users</h4>
              <p data-testid="total-users">{stats.total_users || 0}</p>
            </div>
            <div className="stat-card">
              <h4>Total Drivers</h4>
              <p data-testid="total-drivers">{stats.total_drivers || 0}</p>
            </div>
            <div className="stat-card">
              <h4>Active Drivers</h4>
              <p data-testid="active-drivers">{stats.active_drivers || 0}</p>
            </div>
            <div className="stat-card">
              <h4>Total Rides</h4>
              <p data-testid="total-rides">{stats.total_rides || 0}</p>
            </div>
            <div className="stat-card">
              <h4>Total Deliveries</h4>
              <p data-testid="total-deliveries">{stats.total_deliveries || 0}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'drivers' && (
        <div className="drivers-management" data-testid="drivers-management">
          <h3>Driver Management</h3>
          <div className="drivers-list">
            {drivers.map(driver => (
              <div key={driver.user_id} className="driver-card" data-testid={`driver-${driver.user_id}`}>
                <div className="driver-info">
                  <h4>{driver.user_info?.name || 'Unknown'}</h4>
                  <p>📧 {driver.user_info?.email}</p>
                  <p>📱 {driver.user_info?.phone}</p>
                  <p>🚗 {driver.vehicle_type} - {driver.vehicle_number}</p>
                  <p>📄 License: {driver.license_number}</p>
                </div>
                <div className="driver-status">
                  <span className={`status ${driver.is_verified ? 'verified' : 'pending'}`}>
                    {driver.is_verified ? '✅ Verified' : '⏳ Pending'}
                  </span>
                  <span className={`availability ${driver.is_available ? 'online' : 'offline'}`}>
                    {driver.is_available ? '🟢 Online' : '🔴 Offline'}
                  </span>
                  <p>⭐ Rating: {driver.rating}</p>
                </div>
                <div className="driver-actions">
                  <button 
                    className="btn btn-primary"
                    data-testid={`view-driver-${driver.user_id}`}
                  >
                    View Details
                  </button>
                  <button 
                    className="btn btn-secondary"
                    data-testid={`verify-driver-${driver.user_id}`}
                  >
                    {driver.is_verified ? 'Suspend' : 'Verify'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Main App Component
const App = () => {
  const { user, logout } = useContext(AuthContext);

  if (!user) {
    return <AuthForm />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🛵 SwiftScooty</h1>
          <div className="header-actions">
            <span data-testid="user-info">Welcome, {user.name} ({user.role})</span>
            <button 
              className="logout-btn" 
              onClick={logout}
              data-testid="logout-button"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {user.role === 'customer' && <CustomerDashboard />}
        {user.role === 'driver' && <DriverDashboard />}
        {user.role === 'admin' && <AdminDashboard />}
      </main>
    </div>
  );
};

// App with Auth Provider
const AppWithAuth = () => {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
};

export default AppWithAuth;