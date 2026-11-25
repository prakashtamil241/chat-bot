#!/usr/bin/env python3
"""
PyChat Studio — Python Chatbot Processing Engine
Runs on Python 3.11+ using only the standard library.
Handles slash commands, safe AST math evaluation, session statistics,
and contextual enrichment before Gemini response generation.
"""

from __future__ import annotations

import ast
import datetime
import json
import math
import operator
import platform
import re
import statistics
import sys
from typing import Any

SAFE_BINARY_OPS: dict[type[ast.operator], Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

SAFE_UNARY_OPS: dict[type[ast.unaryop], Any] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

SAFE_FUNCTIONS: dict[str, Any] = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "sum": sum,
    "len": len,
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "log2": math.log2,
    "exp": math.exp,
    "ceil": math.ceil,
    "floor": math.floor,
    "factorial": math.factorial,
    "gcd": math.gcd,
    "mean": statistics.mean,
    "median": statistics.median,
}

SAFE_CONSTANTS: dict[str, float] = {
    "pi": math.pi,
    "e": math.e,
    "tau": math.tau,
}


def safe_eval_ast(node: ast.AST) -> Any:
    """Safely evaluate a restricted Python AST node without exec/eval."""
    if isinstance(node, ast.Expression):
        return safe_eval_ast(node.body)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float, str, bool)):
            return node.value
        raise ValueError(f"Unsupported constant type: {type(node.value).__name__}")

    if isinstance(node, ast.Name):
        if node.id in SAFE_CONSTANTS:
            return SAFE_CONSTANTS[node.id]
        raise ValueError(f"Unknown identifier: {node.id}")

    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in SAFE_BINARY_OPS:
            raise ValueError(f"Unsupported binary operator: {op_type.__name__}")
        left = safe_eval_ast(node.left)
        right = safe_eval_ast(node.right)
        if op_type is ast.Pow and isinstance(right, (int, float)) and abs(right) > 1000:
            raise ValueError("Exponent exceeds safe limit (1000).")
        return SAFE_BINARY_OPS[op_type](left, right)

    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in SAFE_UNARY_OPS:
            raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
        return SAFE_UNARY_OPS[op_type](safe_eval_ast(node.operand))

    if isinstance(node, (ast.List, ast.Tuple)):
        items = [safe_eval_ast(elt) for elt in node.elts]
        return items if isinstance(node, ast.List) else tuple(items)

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("Only direct safe function calls are allowed.")
        func_name = node.func.id
        if func_name not in SAFE_FUNCTIONS:
            raise ValueError(f"Function '{func_name}' is not available in the sandbox.")
        if node.keywords:
            raise ValueError("Keyword arguments are not supported in sandboxed calls.")
        args = [safe_eval_ast(arg) for arg in node.args]
        if func_name == "factorial" and args and isinstance(args[0], int) and args[0] > 500:
            raise ValueError("Factorial input exceeds safe limit (500).")
        return SAFE_FUNCTIONS[func_name](*args)

    raise ValueError(f"Expression construct '{type(node).__name__}' is not allowed.")


def evaluate_python_expression(expr: str) -> str:
    cleaned = expr.strip()
    if not cleaned:
        raise ValueError("Please provide an expression to evaluate.")
    if len(cleaned) > 300:
        raise ValueError("Expression exceeds maximum length (300 characters).")
    tree = ast.parse(cleaned, mode="eval")
    result = safe_eval_ast(tree)
    if isinstance(result, float):
        if result.is_integer():
            return str(int(result))
        return f"{result:.10g}"
    return repr(result) if isinstance(result, str) else str(result)


def compute_session_stats(history: list[dict[str, str]]) -> dict[str, Any]:
    user_msgs = [m.get("text", "") for m in history if m.get("role") == "user"]
    model_msgs = [m.get("text", "") for m in history if m.get("role") == "model"]
    all_text = " ".join(m.get("text", "") for m in history)
    words = re.findall(r"[A-Za-z0-9_]+", all_text.lower())

    stop_words = {
        "the", "and", "for", "that", "this", "with", "you", "are", "can",
        "have", "from", "what", "how", "why", "use", "using", "your", "into",
    }
    freq: dict[str, int] = {}
    for w in words:
        if len(w) >= 3 and w not in stop_words:
            freq[w] = freq.get(w, 0) + 1
    top_terms = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:5]

    return {
        "total_messages": len(history),
        "user_messages": len(user_msgs),
        "assistant_messages": len(model_msgs),
        "total_words": len(words),
        "top_terms": [term for term, _ in top_terms],
    }


def handle_request(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message", "")).strip()
    history = payload.get("history", [])
    if not isinstance(history, list):
        history = []
    system_instruction = str(
        payload.get("systemInstruction")
        or "You are a helpful, accurate Python and AI assistant."
    ).strip()

    py_ver = platform.python_version()
    now_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    if message == "/help":
        help_text = (
            "### Python Runtime Commands\n\n"
            "These commands execute directly inside the Python backend engine (`chatbot_engine.py`):\n\n"
            "- `/calc <expression>` — Evaluate math expressions safely (e.g. `/calc sqrt(144) + 2**8`)\n"
            "- `/py <expression>` — Run a sandboxed Python expression (`mean([12, 18, 24])`, `factorial(7)`)\n"
            "- `/stats` — Analyze word count, turns, and top terms in this conversation\n"
            "- `/time` — Print the current server UTC timestamp from Python `datetime`\n"
            "- `/help` — Show this command reference\n\n"
            "For any regular message, Python pre-processes the prompt and streams the response through Gemini."
        )
        return {
            "directReply": help_text,
            "pythonToolName": "help",
            "pythonToolResult": f"Python {py_ver} command reference",
            "augmentedSystemInstruction": system_instruction,
            "pythonVersion": py_ver,
        }

    if message == "/time":
        return {
            "directReply": f"Current server time from Python `datetime`: **{now_utc}**",
            "pythonToolName": "datetime.now",
            "pythonToolResult": now_utc,
            "augmentedSystemInstruction": system_instruction,
            "pythonVersion": py_ver,
        }

    if message == "/stats":
        stats = compute_session_stats(history)
        terms_str = ", ".join(f"`{t}`" for t in stats["top_terms"]) if stats["top_terms"] else "None yet"
        reply = (
            "### Conversation Analytics (Python)\n\n"
            f"- **Total Messages:** {stats['total_messages']} ({stats['user_messages']} user, {stats['assistant_messages']} assistant)\n"
            f"- **Total Words:** {stats['total_words']}\n"
            f"- **Frequent Terms:** {terms_str}"
        )
        return {
            "directReply": reply,
            "pythonToolName": "session_stats",
            "pythonToolResult": f"{stats['total_messages']} messages · {stats['total_words']} words",
            "augmentedSystemInstruction": system_instruction,
            "pythonVersion": py_ver,
        }

    if message.startswith("/calc ") or message.startswith("/py ") or message in ("/calc", "/py"):
        cmd = "/calc" if message.startswith("/calc") else "/py"
        expr = message[len(cmd):].strip()
        try:
            result = evaluate_python_expression(expr)
            return {
                "directReply": f"```python\n>>> {expr}\n{result}\n```",
                "pythonToolName": "ast_eval",
                "pythonToolResult": f"{expr} = {result}",
                "augmentedSystemInstruction": system_instruction,
                "pythonVersion": py_ver,
            }
        except Exception as exc:
            return {
                "directReply": (
                    f"Python could not evaluate `{expr or '(empty)'}`: {exc}\n\n"
                    "Supported functions: `sqrt`, `sin`, `cos`, `tan`, `log`, `log10`, `exp`, `factorial`, `gcd`, `mean`, `median`, `min`, `max`, `sum`, `round`, `abs`."
                ),
                "pythonToolName": "ast_eval",
                "pythonToolResult": f"Error: {exc}",
                "augmentedSystemInstruction": system_instruction,
                "pythonVersion": py_ver,
            }

    # Check if user asked a pure arithmetic expression directly (e.g. "128 * 45 + 9")
    stripped_math = message.rstrip("?").strip()
    if re.fullmatch(r"[0-9\.\+\-\*\/\(\)\s\^%]{3,60}", stripped_math) and any(
        op in stripped_math for op in ("+", "-", "*", "/", "%")
    ):
        normalized = stripped_math.replace("^", "**")
        try:
            computed = evaluate_python_expression(normalized)
            augmented = (
                f"{system_instruction}\n\n"
                f"[Python Engine Context: Verified calculation `{normalized}` = `{computed}` via Python {py_ver}.]"
            )
            return {
                "directReply": None,
                "pythonToolName": "auto_calc",
                "pythonToolResult": f"{normalized} = {computed}",
                "augmentedSystemInstruction": augmented,
                "pythonVersion": py_ver,
            }
        except Exception:
            pass

    augmented = (
        f"{system_instruction}\n\n"
        f"[Runtime Context: Current UTC time is {now_utc}. Backend orchestration by Python {py_ver}.]"
    )
    return {
        "directReply": None,
        "pythonToolName": None,
        "pythonToolResult": None,
        "augmentedSystemInstruction": augmented,
        "pythonVersion": py_ver,
    }


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        output = handle_request(payload)
        sys.stdout.write(json.dumps(output))
        sys.stdout.flush()
    except Exception as exc:
        sys.stdout.write(
            json.dumps(
                {
                    "directReply": None,
                    "pythonToolName": None,
                    "pythonToolResult": None,
                    "augmentedSystemInstruction": "You are a helpful assistant.",
                    "pythonVersion": platform.python_version(),
                    "warning": str(exc),
                }
            )
        )
        sys.stdout.flush()


if __name__ == "__main__":
    main()
