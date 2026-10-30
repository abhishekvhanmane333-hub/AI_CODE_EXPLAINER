from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from groq import Groq
import mysql.connector
import os
import ast

load_dotenv()
app = Flask(__name__)


# ---------------- DATABASE CONNECTION ----------------

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "ai_code_explainer")
    )


# ---------------- SAVE ANALYSIS ----------------

def save_analysis(code, action, result):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO analysis_history
            (python_code, analysis_type, analysis_result)
            VALUES (%s, %s, %s)
            """,
            (code, action, result)
        )

        connection.commit()
        return True

    except Exception:
        app.logger.exception("Could not save analysis to MySQL")
        return False

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None:
            try:
                connection.close()
            except Exception:
                app.logger.exception("Could not close MySQL connection")


# ---------------- GROQ AI ----------------

def get_ai_result(code, action):
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise ValueError(
            "GROQ_API_KEY is missing from the environment variables."
        )

    prompts = {
        "explain": """
Explain ONLY the given Python code in simple English.

Use these headings:
1. Purpose of the Code
2. Step-by-Step Explanation
3. Important Variables and Functions
4. Expected Output

Do not rewrite or improve the code.
Do not give unrelated suggestions.
""",

        "errors": """
Review the Python code for syntax errors,
possible runtime errors, and logical mistakes.
Explain the issues and suggest fixes.
If no obvious issues are found, say so.
""",

        "improve": """
Improve the Python code for readability and maintainability.
Show the improved code in a Python code block
and explain the changes.
"""
    }

    if action not in prompts:
        raise ValueError("Invalid action selected.")

    client = Groq(api_key=api_key)

    response = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a helpful Python programming teacher. "
                    "Follow the selected task exactly and use clear headings."
                )
            },
            {
                "role": "user",
                "content": (
                    f"{prompts[action]}\n\n"
                    f"Python code:\n```python\n{code}\n```"
                )
            }
        ],
        temperature=0.2
    )

    result = response.choices[0].message.content

    if not result:
        raise RuntimeError("The AI returned an empty response.")

    return result


# ---------------- HOME PAGE ----------------

@app.route("/")
def home():
    return render_template("index.html")


# ---------------- ANALYSIS HISTORY ----------------

@app.route("/history", methods=["GET"])
def history():
    connection = None
    cursor = None

    try:
        search_text = request.args.get("q", "").strip()

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        if search_text:
            search_pattern = f"%{search_text}%"

            cursor.execute(
                """
                SELECT id, python_code, analysis_type,
                       analysis_result, created_at
                FROM analysis_history
                WHERE python_code LIKE %s
                   OR analysis_result LIKE %s
                   OR analysis_type LIKE %s
                ORDER BY created_at DESC
                """,
                (search_pattern, search_pattern, search_pattern)
            )
        else:
            cursor.execute(
                """
                SELECT id, python_code, analysis_type,
                       analysis_result, created_at
                FROM analysis_history
                ORDER BY created_at DESC
                """
            )

        records = cursor.fetchall()

        for record in records:
            if record.get("created_at"):
                record["created_at"] = (
                    record["created_at"].isoformat(sep=" ")
                )

        return jsonify(records)

    except Exception:
        app.logger.exception("Failed to load history")
        return jsonify([])

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None:
            try:
                connection.close()
            except Exception:
                app.logger.exception("Could not close history connection")


# ---------------- DELETE HISTORY RECORD ----------------

@app.route("/history/<int:record_id>", methods=["DELETE"])
def delete_history(record_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute(
            "DELETE FROM analysis_history WHERE id = %s",
            (record_id,)
        )

        if cursor.rowcount == 0:
            connection.rollback()

            return jsonify({
                "error": "Record not found."
            }), 404

        connection.commit()

        return jsonify({
            "success": True,
            "message": f"History record {record_id} deleted."
        })

    except Exception:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                app.logger.exception("Could not roll back deletion")

        app.logger.exception("Failed to delete history record")

        return jsonify({
            "error": "Could not delete the history record."
        }), 500

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None:
            try:
                connection.close()
            except Exception:
                app.logger.exception("Could not close deletion connection")


# ---------------- ANALYZE CODE ----------------

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True) or {}

    code = data.get("code", "").strip()
    action = data.get("action", "").strip()

    if not code:
        return jsonify({
            "error": "Please enter Python code."
        }), 400

    if action not in ("explain", "errors", "improve"):
        return jsonify({
            "error": "Invalid action selected."
        }), 400

    # Check Python syntax
    try:
        ast.parse(code)

    except SyntaxError as error:
        if action == "errors":
            result = (
                f"Syntax error on line {error.lineno}: {error.msg}"
            )

            saved = save_analysis(code, action, result)

            return jsonify({
                "result": result,
                "action": action,
                "saved": saved
            })

        return jsonify({
            "error": (
                f"Syntax error on line {error.lineno}: "
                f"{error.msg}. Select Detect Errors to review it."
            )
        }), 400

    # Get AI result independently of the database
    try:
        result = get_ai_result(code, action)

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    except Exception:
        app.logger.exception("Groq AI request failed")

        return jsonify({
            "error": (
                "AI analysis failed. Check the Groq API key, "
                "model availability, API limits, and Render logs."
            )
        }), 500

    # Saving history is optional; it must not block the AI result
    saved = save_analysis(code, action, result)

    return jsonify({
        "result": result,
        "action": action,
        "saved": saved
    })


if __name__ == "__main__":
    app.run(debug=True)
