

echo "🏛️  EasyHire Launcher"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Python
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "❌ Python not found. Please install Python 3.9+"
    exit 1
fi

PYTHON=$(command -v python3 || command -v python)

# Check pip packages
echo "🔍 Checking Python dependencies..."
$PYTHON -c "import flask, flask_cors, requests, bs4, apscheduler" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "📦 Installing Python dependencies..."
    pip install -r requirements.txt
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Install frontend deps if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

echo ""
echo "🚀 Starting EasyHire..."
echo ""

# Start backend
echo "⚙️  Backend: http://localhost:5000"
$PYTHON app.py &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Start frontend
echo "🌐 Frontend: http://localhost:5173"
cd frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ EasyHire is running!"
echo ""
echo "   Open: http://localhost:5173"
echo ""
echo "   Press Ctrl+C to stop both servers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait and handle Ctrl+C
trap "echo ''; echo 'Stopping EasyHire...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT
wait
