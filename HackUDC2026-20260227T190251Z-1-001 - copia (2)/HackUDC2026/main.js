const AI_SDK_BASE_URL = 'http://localhost:8008';

document.getElementById('analyzeBtn').addEventListener('click', async () => {
    // 1. Obtener valores del UI
    const year = document.getElementById('yearSelect').value;
    const featureSelect = document.getElementById('featureSelect');
    const featureName = featureSelect.options[featureSelect.selectedIndex].text;
    const featureValue = featureSelect.value;

    const genre = document.getElementById('genreSelect').value;
    const genreText = genre !== 'Cualquiera' ? ` del género ${genre}` : '';

    // Elementos del DOM
    const btn = document.getElementById('analyzeBtn');
    const reasoningProcess = document.getElementById('reasoningProcess');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const suggestedTablesDiv = document.getElementById('suggestedTables');
    const generatedSqlCode = document.getElementById('generatedSql');
    const resultsGrid = document.getElementById('resultsGrid');
    const aiContent = document.getElementById('aiContent');
    const badgeYearFeature = document.getElementById('badgeYearFeature');

    // 2. Resetear UI y mostrar loading
    btn.disabled = true;
    btn.classList.add('loading');
    reasoningProcess.classList.remove('hidden');
    resultsGrid.classList.add('hidden');

    // Resetear Step 1
    step1.classList.remove('success', 'error');
    step1.classList.add('active');
    step1.querySelector('.step-status').innerText = 'Analizando metadatos (answerMetadataQuestion)...';
    step1.querySelector('.step-details').classList.add('hidden');
    suggestedTablesDiv.innerHTML = '';

    // Resetear Step 2
    step2.classList.remove('active', 'success', 'error');
    step2.classList.add('pending');
    step2.querySelector('.step-status').innerText = 'Esperando a la Fase 1...';
    step2.querySelector('.step-details').classList.add('hidden');
    generatedSqlCode.innerText = '';

    try {
        // ==========================================
        // FASE 1: DESCUBRIMIENTO (Metadata)
        // ==========================================
        const metadataPrompt = `Quiero buscar canciones del año ${year}${genreText} basándome en la característica musical: ${featureName} (${featureValue}). ¿Qué tablas o vistas de la base de datos 'admin' contienen esta información (artista, canción, popularidad, género, danceability, energy, etc.) y qué columnas debo usar?`;

        console.log("FASE 1 - Preguntando metadata:", metadataPrompt);

        const metadataResponse = await fetch(`${AI_SDK_BASE_URL}/answerMetadataQuestion`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic YWRtaW46YWRtaW4='
            },
            body: JSON.stringify({
                question: metadataPrompt,
                vdp_database_names: "admin",
                llm_model: "gemma-3-27b-it",
                vector_search_k: 5
            })
        });

        if (!metadataResponse.ok) {
            const errTxt = await metadataResponse.text();
            throw new Error(`Fallo en answerMetadataQuestion: ${metadataResponse.status} - ${errTxt}`);
        }
        const metadataData = await metadataResponse.json();

        // Finalizar y actualizar Step 1
        step1.classList.remove('active');
        step1.classList.add('success');
        step1.querySelector('.step-status').innerText = '¡Metadatos descubiertos!';

        // Extraer tablas usadas del array tables_used
        const tablesUsed = metadataData.tables_used || [];
        if (tablesUsed.length > 0) {
            step1.querySelector('.step-details').classList.remove('hidden');
            tablesUsed.forEach(t => {
                const span = document.createElement('span');
                span.className = 'tag';
                span.innerText = t;
                suggestedTablesDiv.appendChild(span);
            });
        }

        // ==========================================
        // FASE 2: EXTRACCIÓN Y RAZONAMIENTO (Data)
        // ==========================================
        // Activar Step 2
        step2.classList.remove('pending');
        step2.classList.add('active');
        step2.querySelector('.step-status').innerText = 'Generando SQL y evaluando datos (answerDataQuestion)...';

        // Usamos la información obtenida para forzar al LLM a buscar datos reales
        const tablesContext = tablesUsed.join(", ");
        const dataPrompt = `Basándote en las tablas encontradas (${tablesContext}), busca el top 3 de canciones del año ${year}${genreText} que tengan el nivel más alto en la característica musical: ${featureValue}. 
        IMPORTANTE: Devuélveme una justificación analítica inicial y luego, OBLIGATORIAMENTE, una tabla en formato Markdown con las columnas exactas: | Canción | Artista | Fecha de Lanzamiento | Género | . Puedes cruzar información si es necesario.`;

        console.log("FASE 2 - Obteniendo datos:", dataPrompt);

        const dataResponse = await fetch(`${AI_SDK_BASE_URL}/answerDataQuestion`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic YWRtaW46YWRtaW4='
            },
            body: JSON.stringify({
                question: dataPrompt,
                vdp_database_names: "admin",
                use_views: tablesContext, // Le pasamos las vistas que sacamos en metadata
                llm_model: "gemma-3-27b-it"
            })
        });

        if (!dataResponse.ok) {
            const errTxt = await dataResponse.text();
            throw new Error(`Fallo en answerDataQuestion: ${dataResponse.status} - ${errTxt}`);
        }
        const finalData = await dataResponse.json();

        // Finalizar y actualizar Step 2
        step2.classList.remove('active');
        step2.classList.add('success');
        step2.querySelector('.step-status').innerText = '¡Datos extraídos con éxito!';
        step2.querySelector('.step-details').classList.remove('hidden');

        const generatedSql = finalData.sql_query || "No se requirió SQL o no se generó";
        generatedSqlCode.innerText = generatedSql;

        // ==========================================
        // MOSTRAR VEREDICTO FINAL
        // ==========================================
        badgeYearFeature.innerText = `${featureName} - ${year}`;
        // En lugar de usar replace(/\n/g, '<br>'), pintamos el markdown como html básico (o text si el backend ya manda html)
        // El SDK suele devolver markdown, por lo que unos regex sencillos o usando innerText con pre-line ayuda
        aiContent.innerHTML = formatMarkdownToHTML(finalData.answer);

        resultsGrid.classList.remove('hidden');

    } catch (error) {
        console.error(error);

        // Manejar error visualmente
        if (step1.classList.contains('active')) {
            step1.classList.remove('active');
            step1.classList.add('error');
            step1.querySelector('.step-status').innerText = 'Error al contactar con Denodo AI SDK';
        } else if (step2.classList.contains('active')) {
            step2.classList.remove('active');
            step2.classList.add('error');
            step2.querySelector('.step-status').innerText = 'Error al ejecutar la consulta de datos';
        }

    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
});

// Helper básico para transformar markdown en HTML si no tenemos librería marked
function formatMarkdownToHTML(markdown) {
    if (!markdown) return '';
    let html = markdown
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        // Listas (muy básico)
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        // List wraps
        .replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>')
        // Limpieza de uls anidados
        .replace(/<\/ul>\n<ul>/gim, '\n');

    // Parseo muy básico de Tablas Markdown a HTML
    const tableRegex = /((?:\|.+)+\|\n)+(?:\|[-: ]+)+\|\n((?:\|.+)+\|(?:\n|$))+/g;
    html = html.replace(tableRegex, (match) => {
        const rows = match.trim().split('\n');
        let tableHtml = '<div class="table-container"><table class="rag-table">';
        let isHead = true;

        rows.forEach((row, i) => {
            // Ignorar la fila separadora de markdown "|---|---|..."
            if (row.match(/^\|?[\s-:]+\|.*$/)) {
                isHead = false;
                return;
            }

            const cols = row.split('|').filter(c => c.trim() !== '').map(c => c.trim());
            if (cols.length === 0) return;

            tableHtml += '<tr>';
            cols.forEach(col => {
                if (isHead) {
                    tableHtml += `<th>${col}</th>`;
                } else {
                    tableHtml += `<td>${col}</td>`;
                }
            });
            tableHtml += '</tr>';
        });
        tableHtml += '</table></div>';
        return tableHtml;
    });

    // Saltos de línea (excepto dentro de tags HTML como tablas o listas)
    // Esto es un parche rápido, lo ideal sería usar la librería 'marked.js'
    html = html.replace(/\n(?![^<]*>)/g, '<br>');

    return html;
}