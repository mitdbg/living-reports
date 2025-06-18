// Sample Tools for Demonstration
export async function addSampleTools() {
  // Check if tools already exist via API
  try {
    const response = await fetch('http://127.0.0.1:5000/api/tools');
    const result = await response.json();
    if (result.success && result.tools && result.tools.length > 0) {
      return; // Don't add samples if tools already exist
    }
  } catch (error) {
    console.error('Error checking existing tools:', error);
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
    },
    {
      id: 'sample_4',
      name: 'Chart Generator',
      description: 'Generate charts and visualizations from datasets',
      code: `# Chart Generator for Code Instances
# Main function that will be called by code instances

def main(datasets, parameters):
    """Main function for generating charts from datasets"""
    
    # Get chart configuration from parameters
    chart_type = parameters.get('chart_type', 'bar')
    title = parameters.get('title', 'Data Visualization')
    x_column = parameters.get('x_column', '')
    y_column = parameters.get('y_column', '')
    
    results = {
        'type': 'chart',
        'chart_type': chart_type,
        'title': title,
        'data': [],
        'summary': ''
    }
    
    # Process each dataset
    for dataset_name, dataset in datasets.items():
        try:
            # Simple data processing for demonstration
            if hasattr(dataset, 'content') and isinstance(dataset.content, str):
                # Parse CSV-like content
                lines = dataset.content.strip().split('\\n')
                if len(lines) > 1:
                    headers = lines[0].split(',')
                    data_points = []
                    
                    for line in lines[1:]:
                        values = line.split(',')
                        if len(values) >= 2:
                            data_points.append({
                                'x': values[0].strip(),
                                'y': float(values[1].strip()) if values[1].strip().replace('.', '').isdigit() else values[1].strip()
                            })
                    
                    results['data'].extend(data_points)
            
        except Exception as e:
            console.log(f"Error processing dataset {dataset_name}: {e}")
    
    # Generate summary
    if results['data']:
        total_points = len(results['data'])
        results['summary'] = f"Generated {chart_type} chart with {total_points} data points"
        
        # Create simple ASCII chart for demo
        results['ascii_chart'] = generate_ascii_chart(results['data'], chart_type)
    else:
        results['summary'] = "No data available for chart generation"
    
    return results

def generate_ascii_chart(data, chart_type):
    """Generate a simple ASCII representation of the chart"""
    if not data:
        return "No data to display"
    
    chart_lines = []
    chart_lines.append(f"📊 {chart_type.upper()} CHART")
    chart_lines.append("=" * 30)
    
    for i, point in enumerate(data[:10]):  # Limit to first 10 points
        x_val = str(point['x'])[:15]  # Truncate long labels
        y_val = point['y']
        
        if isinstance(y_val, (int, float)):
            # Create simple bar representation
            bar_length = int(y_val / max([p['y'] for p in data if isinstance(p['y'], (int, float))]) * 20)
            bar = "█" * bar_length
            chart_lines.append(f"{x_val:<15} │{bar} {y_val}")
        else:
            chart_lines.append(f"{x_val:<15} │ {y_val}")
    
    if len(data) > 10:
        chart_lines.append(f"... and {len(data) - 10} more data points")
    
    return "\\n".join(chart_lines)

# Example parameters for reference:
# chart_type: 'bar', 'line', 'pie'
# title: 'My Chart Title' 
# x_column: 'category'
# y_column: 'value'

console.log("Chart Generator tool loaded successfully!")`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'sample_5',
      name: 'Data Processor',
      description: 'Process and transform datasets with filtering and aggregation',
      code: `# Data Processor for Code Instances

def main(datasets, parameters):
    """Main function for processing datasets"""
    
    operation = parameters.get('operation', 'summarize')
    filter_column = parameters.get('filter_column', '')
    filter_value = parameters.get('filter_value', '')
    group_by = parameters.get('group_by', '')
    
    results = {
        'type': 'processed_data',
        'operation': operation,
        'summary': '',
        'data': {},
        'stats': {}
    }
    
    # Process each dataset
    for dataset_name, dataset in datasets.items():
        try:
            processed = process_dataset(dataset, operation, {
                'filter_column': filter_column,
                'filter_value': filter_value,
                'group_by': group_by
            })
            
            results['data'][dataset_name] = processed
            
        except Exception as e:
            console.log(f"Error processing dataset {dataset_name}: {e}")
            results['data'][dataset_name] = {'error': str(e)}
    
    # Generate summary
    total_datasets = len(results['data'])
    results['summary'] = f"Processed {total_datasets} dataset(s) using '{operation}' operation"
    
    return results

def process_dataset(dataset, operation, params):
    """Process a single dataset based on operation type"""
    
    if not hasattr(dataset, 'content'):
        return {'error': 'Dataset has no content'}
    
    # Parse CSV-like content
    lines = dataset.content.strip().split('\\n')
    if len(lines) < 2:
        return {'error': 'Dataset needs at least header and one data row'}
    
    headers = [h.strip() for h in lines[0].split(',')]
    rows = []
    
    for line in lines[1:]:
        values = [v.strip() for v in line.split(',')]
        if len(values) == len(headers):
            row = dict(zip(headers, values))
            rows.append(row)
    
    if operation == 'summarize':
        return summarize_data(rows, headers)
    elif operation == 'filter':
        return filter_data(rows, params)
    elif operation == 'group':
        return group_data(rows, params)
    else:
        return {'error': f'Unknown operation: {operation}'}

def summarize_data(rows, headers):
    """Generate summary statistics for the dataset"""
    summary = {
        'total_rows': len(rows),
        'columns': headers,
        'sample_data': rows[:3] if rows else [],
        'column_stats': {}
    }
    
    for header in headers:
        values = [row[header] for row in rows if row[header]]
        numeric_values = []
        
        for val in values:
            try:
                numeric_values.append(float(val))
            except ValueError:
                pass
        
        if numeric_values:
            summary['column_stats'][header] = {
                'type': 'numeric',
                'count': len(numeric_values),
                'min': min(numeric_values),
                'max': max(numeric_values),
                'avg': sum(numeric_values) / len(numeric_values)
            }
        else:
            unique_values = list(set(values))
            summary['column_stats'][header] = {
                'type': 'text',
                'count': len(values),
                'unique': len(unique_values),
                'top_values': unique_values[:5]
            }
    
    return summary

def filter_data(rows, params):
    """Filter dataset based on column value"""
    filter_column = params.get('filter_column', '')
    filter_value = params.get('filter_value', '')
    
    if not filter_column or not filter_value:
        return {'error': 'Filter requires both column and value'}
    
    filtered_rows = [row for row in rows if row.get(filter_column) == filter_value]
    
    return {
        'original_count': len(rows),
        'filtered_count': len(filtered_rows),
        'filter_column': filter_column,
        'filter_value': filter_value,
        'filtered_data': filtered_rows[:10]  # Show first 10 results
    }

def group_data(rows, params):
    """Group dataset by specified column"""
    group_by = params.get('group_by', '')
    
    if not group_by:
        return {'error': 'Group operation requires group_by column'}
    
    groups = {}
    for row in rows:
        key = row.get(group_by, 'Unknown')
        if key not in groups:
            groups[key] = []
        groups[key].append(row)
    
    group_summary = {}
    for key, group_rows in groups.items():
        group_summary[key] = {
            'count': len(group_rows),
            'sample': group_rows[0] if group_rows else {}
        }
    
    return {
        'group_by': group_by,
        'total_groups': len(groups),
        'groups': group_summary
    }

console.log("Data Processor tool loaded successfully!")`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  // Save sample tools via API
  try {
    const response = await fetch('http://127.0.0.1:5000/api/tools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tools: sampleTools })
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('✅ Sample tools added via API');
    } else {
      console.error('❌ Error adding sample tools:', result.error);
    }
  } catch (error) {
    console.error('❌ Error adding sample tools:', error);
  }
} 