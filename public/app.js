async function main() {
    const output = document.getElementById("health-output");

    try {
        const response = await fetch("/api/health");
        const json = await response.json();
        output.textContent = JSON.stringify(json, null, 2);
    } catch (error) {
        output.textContent = error instanceof Error ? error.message : String(error);
    }
}

main();
