// Sample Tools for Demonstration
export function addSampleTools() {
  // Check if tools already exist in localStorage
  const existingTools = localStorage.getItem('tools_data');
  if (existingTools && JSON.parse(existingTools).length > 0) {
    return; // Don't add samples if tools already exist
  }

  const sampleTools = [
    {
      id: 'sample_1',
      name: 'Data Analysis Helper',
      description: 'Basic data analysis functions for processing datasets',
      code: `# Data Analysis Helper
import pandas as pd
import numpy as np
from datetime import datetime

# Load and analyze data
def analyze_data(data):
    """Analyze basic statistics of dataset"""
    if isinstance(data, list):
        data = pd.DataFrame(data)
    
    results = {
        'shape': data.shape,
        'columns': list(data.columns) if hasattr(data, 'columns') else None,
        'summary': data.describe().to_dict() if hasattr(data, 'describe') else None,
        'null_counts': data.isnull().sum().to_dict() if hasattr(data, 'isnull') else None
    }
    
    return results

# Sample usage
print("Data Analysis Helper loaded successfully!")`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'sample_2',
      name: 'Math Utilities',
      description: 'Common mathematical calculations and utilities',
      code: `# Math Utilities
import math

def fibonacci(n):
    """Generate fibonacci sequence up to n terms"""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    elif n == 2:
        return [0, 1]
    
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    return fib

def prime_numbers(limit):
    """Generate prime numbers up to limit"""
    primes = []
    for num in range(2, limit + 1):
        is_prime = True
        for i in range(2, int(math.sqrt(num)) + 1):
            if num % i == 0:
                is_prime = False
                break
        if is_prime:
            primes.append(num)
    return primes

def calculate_statistics(numbers):
    """Calculate basic statistics for a list of numbers"""
    if not numbers:
        return {}
    
    return {
        'count': len(numbers),
        'sum': sum(numbers),
        'mean': sum(numbers) / len(numbers),
        'min': min(numbers),
        'max': max(numbers),
        'range': max(numbers) - min(numbers)
    }

# Sample data
sample_numbers = [1, 2, 3, 4, 5, 10, 15, 20]
stats = calculate_statistics(sample_numbers)
print("Math Utilities loaded!")
print("Sample statistics:", stats)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'sample_3',
      name: 'API Helper',
      description: 'Helper functions for making API calls and processing responses',
      code: `# API Helper
import json
import urllib.request
import urllib.parse
from datetime import datetime

def make_api_call(url, params=None, headers=None):
    """Make a simple API call and return JSON response"""
    try:
        if params:
            url += '?' + urllib.parse.urlencode(params)
        
        req = urllib.request.Request(url)
        if headers:
            for key, value in headers.items():
                req.add_header(key, value)
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            return {
                'success': True,
                'data': data,
                'status_code': response.getcode()
            }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

def format_api_response(response):
    """Format API response for better readability"""
    if response.get('success'):
        return {
            'status': 'Success',
            'data_type': type(response['data']).__name__,
            'data_keys': list(response['data'].keys()) if isinstance(response['data'], dict) else None,
            'timestamp': datetime.now().isoformat()
        }
    else:
        return {
            'status': 'Error',
            'error': response.get('error', 'Unknown error'),
            'timestamp': response.get('timestamp', datetime.now().isoformat())
        }

# Example usage
print("API Helper loaded!")
print("Use make_api_call(url, params, headers) to make API requests")`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  // Save sample tools to localStorage
  localStorage.setItem('tools_data', JSON.stringify(sampleTools));
  console.log('✅ Sample tools added to localStorage');
} 