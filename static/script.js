// ==========================================
// AI CODE EXPLAINER - JAVASCRIPT
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // Main elements
    const codeInput = document.getElementById("codeInput");

    const explainBtn = document.getElementById("explainBtn");
    const errorsBtn = document.getElementById("errorsBtn");
    const improveBtn = document.getElementById("improveBtn");
    const clearBtn = document.getElementById("clearBtn");

    const statusMessage = document.getElementById("statusMessage");
    const resultOutput = document.getElementById("resultOutput");

    // Download elements
    const downloadBtn = document.getElementById("downloadBtn");
    const downloadStatus = document.getElementById("downloadStatus");

    // History elements
    const historySearch = document.getElementById("historySearch");
    const searchBtn = document.getElementById("searchBtn");
    const historyBtn = document.getElementById("historyBtn");
    const historyCount = document.getElementById("historyCount");
    const historyStatus = document.getElementById("historyStatus");
    const historyOutput = document.getElementById("historyOutput");

    let currentAnalysisResult = "";
    let currentHistoryQuery = "";

    // ==========================================
    // STATUS MESSAGE
    // ==========================================

    function setStatus(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.classList.toggle("error-message", isError);
    }

    function setHistoryStatus(message, isError = false) {
        historyStatus.textContent = message;
        historyStatus.classList.toggle("error-message", isError);
    }

    // ==========================================
    // ANALYZE PYTHON CODE
    // ==========================================

    async function analyzeCode(action) {
        const code = codeInput.value.trim();

        if (!code) {
            setStatus("Please enter your Python code first.", true);
            codeInput.focus();
            return;
        }

        const buttons = [
            explainBtn,
            errorsBtn,
            improveBtn
        ];

        buttons.forEach(button => {
            button.disabled = true;
        });

        resultOutput.textContent = "Analyzing your code. Please wait...";
        resultOutput.classList.add("loading");
        resultOutput.style.whiteSpace = "pre-wrap";

        setStatus("AI is analyzing your Python code...");

        try {
            const response = await fetch("/analyze", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    code: code,
                    action: action
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Unable to analyze the code."
                );
            }

            currentAnalysisResult = data.result || "";

            resultOutput.textContent = currentAnalysisResult;
            resultOutput.classList.remove("loading");

            const actionNames = {
                explain: "Code explanation",
                errors: "Error detection",
                improve: "Code improvement"
            };

            setStatus(
                `${actionNames[action]} completed successfully. ` +
                "Analysis saved to history."
            );

            downloadStatus.textContent = "";

            // Refresh history after successful analysis.
            await loadHistory(currentHistoryQuery);

        } catch (error) {
            currentAnalysisResult = "";

            resultOutput.textContent = error.message;
            resultOutput.classList.remove("loading");

            setStatus(error.message, true);

        } finally {
            buttons.forEach(button => {
                button.disabled = false;
            });
        }
    }

    // ==========================================
    // BUTTON EVENTS
    // ==========================================

    explainBtn.addEventListener("click", () => {
        analyzeCode("explain");
    });

    errorsBtn.addEventListener("click", () => {
        analyzeCode("errors");
    });

    improveBtn.addEventListener("click", () => {
        analyzeCode("improve");
    });

    clearBtn.addEventListener("click", () => {
        codeInput.value = "";
        codeInput.focus();

        setStatus("Code editor cleared.");
    });

    // ==========================================
    // DOWNLOAD RESULT AS TXT
    // ==========================================

    downloadBtn.addEventListener("click", () => {
        const result = currentAnalysisResult.trim();

        if (!result) {
            downloadStatus.textContent =
                "Please analyze some code before downloading the result.";

            downloadStatus.classList.add("error-message");
            return;
        }

        const content =
            "AI CODE EXPLAINER\n" +
            "================\n\n" +
            "Date: " + new Date().toLocaleString() + "\n\n" +
            "ANALYSIS RESULT\n" +
            "===============\n\n" +
            result;

        const blob = new Blob(
            [content],
            { type: "text/plain;charset=utf-8" }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-");

        link.href = url;
        link.download = `AI_Code_Analysis_${timestamp}.txt`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        downloadStatus.textContent =
            "Result downloaded successfully.";

        downloadStatus.classList.remove("error-message");
    });

    // ==========================================
    // LOAD HISTORY
    // ==========================================

    async function loadHistory(query = "") {
        currentHistoryQuery = query.trim();

        historyOutput.replaceChildren();
        historyCount.textContent = "Loading...";
        setHistoryStatus("Loading saved analyses...");

        try {
            let endpoint = "/history";

            if (currentHistoryQuery) {
                endpoint += "?q=" +
                    encodeURIComponent(currentHistoryQuery);
            }

            const response = await fetch(endpoint);
            const records = await response.json();

            if (!response.ok) {
                throw new Error(
                    records.error || "Could not load history."
                );
            }

            if (!Array.isArray(records)) {
                throw new Error("Unexpected history response.");
            }

            historyCount.textContent =
                `${records.length} record${records.length === 1 ? "" : "s"}`;

            if (records.length === 0) {
                const emptyMessage = document.createElement("p");

                emptyMessage.textContent = currentHistoryQuery
                    ? "No matching history records found."
                    : "No history records found yet.";

                emptyMessage.className = "section-description";
                historyOutput.appendChild(emptyMessage);

                setHistoryStatus(
                    currentHistoryQuery
                        ? "Try another search term."
                        : "Your saved analyses will appear here."
                );

                return;
            }

            records.forEach(record => {
                const card = createHistoryCard(record);
                historyOutput.appendChild(card);
            });

            setHistoryStatus(
                currentHistoryQuery
                    ? `Found ${records.length} matching record(s).`
                    : "History loaded successfully."
            );

        } catch (error) {
            historyCount.textContent = "Unavailable";
            setHistoryStatus(error.message, true);
        }
    }

    // ==========================================
    // CREATE ONE HISTORY CARD
    // ==========================================

    function createHistoryCard(record) {
        const card = document.createElement("article");
        card.className = "history-record";

        const title = document.createElement("h3");

        const actionNames = {
            explain: "🧠 Code Explanation",
            errors: "🔍 Error Detection",
            improve: "✨ Code Improvement"
        };

        title.textContent =
            actionNames[record.analysis_type] ||
            record.analysis_type ||
            "Code Analysis";

        const meta = document.createElement("p");
        meta.className = "history-meta";

        meta.textContent =
            `Record ID: ${record.id}  |  ` +
            `Date: ${record.created_at || "Unknown"}`;

        const codeHeading = document.createElement("h4");
        codeHeading.textContent = "Python Code";

        const codeBlock = document.createElement("pre");
        codeBlock.className = "history-code";
        codeBlock.textContent = record.python_code || "";
        codeBlock.style.whiteSpace = "pre-wrap";

        const resultHeading = document.createElement("h4");
        resultHeading.textContent = "Analysis Result";

        const resultBlock = document.createElement("div");
        resultBlock.className = "history-result";
        resultBlock.textContent = record.analysis_result || "";
        resultBlock.style.whiteSpace = "pre-wrap";

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const loadCodeBtn = document.createElement("button");
        loadCodeBtn.type = "button";
        loadCodeBtn.className = "btn btn-secondary";
        loadCodeBtn.textContent = "↩ Load Code";

        loadCodeBtn.addEventListener("click", () => {
            codeInput.value = record.python_code || "";

            codeInput.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            codeInput.focus();
            setStatus("Code loaded from history.");
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-delete";
        deleteBtn.textContent = "🗑️ Delete";

        deleteBtn.addEventListener("click", async () => {
            await deleteHistoryRecord(record.id, deleteBtn);
        });

        actions.appendChild(loadCodeBtn);
        actions.appendChild(deleteBtn);

        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(codeHeading);
        card.appendChild(codeBlock);
        card.appendChild(resultHeading);
        card.appendChild(resultBlock);
        card.appendChild(actions);

        return card;
    }

    // ==========================================
    // DELETE ONE HISTORY RECORD
    // ==========================================

    async function deleteHistoryRecord(recordId, button) {
        const confirmed = window.confirm(
            `Are you sure you want to delete history record ${recordId}?\n\n` +
            "This action cannot be undone."
        );

        if (!confirmed) {
            return;
        }

        button.disabled = true;
        button.textContent = "Deleting...";

        try {
            const response = await fetch(`/history/${recordId}`, {
                method: "DELETE"
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Could not delete this record."
                );
            }

            setHistoryStatus(
                `History record ${recordId} deleted successfully.`
            );

            await loadHistory(currentHistoryQuery);

        } catch (error) {
            setHistoryStatus(error.message, true);

            button.disabled = false;
            button.textContent = "🗑️ Delete";
        }
    }

    // ==========================================
    // SEARCH HISTORY
    // ==========================================

    searchBtn.addEventListener("click", () => {
        loadHistory(historySearch.value);
    });

    historySearch.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            loadHistory(historySearch.value);
        }
    });

    // ==========================================
    // SHOW ALL HISTORY
    // ==========================================

    historyBtn.addEventListener("click", () => {
        historySearch.value = "";
        loadHistory("");
    });

    // ==========================================
    // INITIAL PAGE SETUP
    // ==========================================

    resultOutput.style.whiteSpace = "pre-wrap";
    loadHistory("");
});