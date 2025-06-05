# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- Run application: `python app.py`
- Install dependencies: `pip install -r requirements.txt`
- Activate virtualenv: `source .venv/bin/activate` (macOS/Linux) or `.venv\Scripts\activate` (Windows)
- Run linting: `flake8 app.py`
- Run type checking: `mypy app.py`

## Code Style
- **Imports:** Standard library first, then third-party, then local applications, alphabetized within each group
- **Formatting:** Use Black with default settings, 4-space indentation for Python
- **Type Hints:** Add type hints to all function parameters and return values
- **Naming:** snake_case for variables/functions, PascalCase for classes, UPPER_CASE for constants
- **Error Handling:** Use specific exceptions with informative error messages, log errors appropriately
- **Docstrings:** Use Google-style docstrings for functions and classes
- **HTML/CSS:** 4-space indentation, attribute values in double quotes, semantic HTML5 elements
- **JavaScript:** camelCase variables/functions, 4-space indentation
- **Always use descriptive variable names**