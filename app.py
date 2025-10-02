from flask import Flask, render_template, request, jsonify, send_from_directory, url_for
from werkzeug.utils import secure_filename
import google.generativeai as genai
import os
from datetime import datetime
import json
from PIL import Image
import secrets

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Configure Gemini API
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
model = genai.GenerativeModel("models/gemini-2.5-flash")

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# In-memory storage (replace with database in production)
calorie_data = {}

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/history')
def history():
    return render_template('history.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """Serve uploaded images"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/analyze', methods=['POST'])
def analyze_food():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    file = request.files['image']
    meal_type = request.form.get('meal_type', 'snack')
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}")
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            # Open and analyze image with Gemini
            img = Image.open(filepath)
            
            prompt = """Analyze this food image and provide detailed nutritional information in JSON format.
            
            Return ONLY valid JSON with this exact structure:
            {
                "items": [
                    {
                        "name": "food item name",
                        "quantity": "estimated quantity (e.g., 1 cup, 200g, 2 pieces)",
                        "calories": estimated_calories_number,
                        "protein": grams,
                        "carbs": grams,
                        "fat": grams,
                        "fiber": grams
                    }
                ],
                "total_calories": total_calories_number,
                "total_protein": total_grams,
                "total_carbs": total_grams,
                "total_fat": total_grams,
                "total_fiber": total_grams
            }
            
            Be as accurate as possible with quantities and nutritional values."""
            
            response = model.generate_content([prompt, img])
            
            # Parse JSON from response
            response_text = response.text.strip()
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]
            
            result = json.loads(response_text.strip())
            result['image_path'] = url_for('uploaded_file', filename=filename, _external=True)  # full URL
            result['meal_type'] = meal_type
            result['timestamp'] = datetime.now().isoformat()
            
            return jsonify(result)
        
        except Exception as e:
            return jsonify({'error': f'Analysis failed: {str(e)}'}), 500
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/reanalyze', methods=['POST'])
def reanalyze_food():
    data = request.json
    image_path = data.get('image_path')
    modifications = data.get('modifications', '')
    meal_type = data.get('meal_type', 'snack')
    
    if not image_path:
        return jsonify({'error': 'No image path provided'}), 400
    
    filename = os.path.basename(image_path)  # extract filename from URL or path
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'Image not found'}), 404
    
    try:
        img = Image.open(filepath)
        
        prompt = f"""Analyze this food image with the following modifications from the user:
        {modifications}
        
        Provide updated nutritional information in JSON format.
        
        Return ONLY valid JSON with this exact structure:
        {{
            "items": [
                {{
                    "name": "food item name",
                    "quantity": "estimated quantity",
                    "calories": estimated_calories_number,
                    "protein": grams,
                    "carbs": grams,
                    "fat": grams,
                    "fiber": grams
                }}
            ],
            "total_calories": total_calories_number,
            "total_protein": total_grams,
            "total_carbs": total_grams,
            "total_fat": total_grams,
            "total_fiber": total_grams
        }}
        
        Take the user's modifications into account when calculating nutritional values."""
        
        response = model.generate_content([prompt, img])
        
        response_text = response.text.strip()
        if response_text.startswith('```json'):
            response_text = response_text[7:]
        if response_text.endswith('```'):
            response_text = response_text[:-3]
        
        result = json.loads(response_text.strip())
        result['image_path'] = url_for('uploaded_file', filename=filename, _external=True)
        result['meal_type'] = meal_type
        result['timestamp'] = datetime.now().isoformat()
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': f'Reanalysis failed: {str(e)}'}), 500

@app.route('/save_meal', methods=['POST'])
def save_meal():
    data = request.json
    date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    if date not in calorie_data:
        calorie_data[date] = {
            'meals': [],
            'total_calories': 0,
            'total_protein': 0,
            'total_carbs': 0,
            'total_fat': 0,
            'total_fiber': 0
        }
    
    calorie_data[date]['meals'].append(data)
    calorie_data[date]['total_calories'] += data.get('total_calories', 0)
    calorie_data[date]['total_protein'] += data.get('total_protein', 0)
    calorie_data[date]['total_carbs'] += data.get('total_carbs', 0)
    calorie_data[date]['total_fat'] += data.get('total_fat', 0)
    calorie_data[date]['total_fiber'] += data.get('total_fiber', 0)
    
    return jsonify({'success': True, 'date': date})

@app.route('/get_daily_data/<date>')
def get_daily_data(date):
    data = calorie_data.get(date, {
        'meals': [],
        'total_calories': 0,
        'total_protein': 0,
        'total_carbs': 0,
        'total_fat': 0,
        'total_fiber': 0
    })
    return jsonify(data)

@app.route('/get_all_dates')
def get_all_dates():
    dates = sorted(calorie_data.keys(), reverse=True)
    return jsonify(dates)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
