// app.js

console.log('App.js loaded');

// Store the FHIR client globally so modal functions can access it
let globalClient = null;

// Initialize the SMART on FHIR client
FHIR.oauth2.ready()
    .then(client => {
        console.log('✅ SMART client ready');
        console.log('Client object:', client);
        console.log('Patient ID:', client.patient.id);
        console.log('Access Token:', client.state.tokenResponse.access_token ? 'Present' : 'Missing');
        
        // Store client globally
        globalClient = client;
        
        // Fetch all data in parallel
        Promise.all([
            loadPatientData(client),
            loadAllergies(client),
            loadMedications(client),
            loadConditions(client),
            loadVitalSigns(client),
            loadDocuments(client)
        ])
        .then(() => {
            console.log('✅ All data loaded successfully');
            document.getElementById('loading').style.display = 'none';
            document.getElementById('content').style.display = 'block';
        })
        .catch(error => {
            console.error('❌ Error loading data:', error);
            showError('Failed to load data: ' + error.message);
        });
    })
    .catch(error => {
        console.error('❌ Authorization failed:', error);
        showError('Authorization failed: ' + error.message);
    });

/**
 * Load and display patient demographic information
 */
async function loadPatientData(client) {
    try {
        console.log('📥 Fetching patient data...');
        
        const patient = await client.request(`Patient/${client.patient.id}`);
        
        console.log('✅ Patient data received:', patient);
        
        // Extract and display patient name
        if (patient.name && patient.name.length > 0) {
            const name = patient.name[0];
            const fullName = [
                name.prefix ? name.prefix.join(' ') : '',
                name.given ? name.given.join(' ') : '',
                name.family || ''
            ].filter(Boolean).join(' ');
            
            document.getElementById('patientName').textContent = fullName;
            console.log('✅ Patient name set:', fullName);
        }
        
        // Display date of birth
        if (patient.birthDate) {
            const dob = new Date(patient.birthDate);
            const formatted = dob.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            document.getElementById('patientDOB').textContent = formatted;
            console.log('✅ DOB set:', formatted);
        }
        
        // Display gender
        if (patient.gender) {
            const gender = patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1);
            document.getElementById('patientGender').textContent = gender;
            console.log('✅ Gender set:', gender);
        }
        
        // Display Medical Record Number (MRN)
        if (patient.identifier && patient.identifier.length > 0) {
            const mrnIdentifier = patient.identifier.find(id => 
                id.type && id.type.coding && 
                id.type.coding.some(c => c.code === 'MR')
            );
            
            if (mrnIdentifier && mrnIdentifier.value) {
                document.getElementById('patientMRN').textContent = mrnIdentifier.value;
                console.log('✅ MRN set:', mrnIdentifier.value);
            }
        }
        
    } catch (error) {
        console.error('❌ Error loading patient data:', error);
        throw error;
    }
}

/**
 * Load and display allergies
 */
async function loadAllergies(client) {
    try {
        console.log('📥 Fetching allergies...');
        
        const response = await client.request(
            `AllergyIntolerance?patient=${client.patient.id}&_sort=-recordedDate&_count=20`,
            { flat: true }
        );
        
        console.log('✅ Allergies response:', response);
        
        const allergiesList = document.getElementById('allergiesList');
        let allergies = [];
        
        if (response.resourceType === 'Bundle' && response.entry) {
            allergies = response.entry.map(entry => entry.resource);
        } else if (Array.isArray(response)) {
            allergies = response;
        }
        
        console.log(`🚫 Found ${allergies.length} allergies`);
        
        if (allergies.length === 0) {
            allergiesList.innerHTML = '<div class="empty-state">No known allergies</div>';
            return;
        }
        
        allergiesList.innerHTML = allergies.map(allergy => {
            const allergen = getAllergen(allergy);
            const severity = allergy.criticality || 'unknown';
            const reaction = getReactions(allergy);
            
            return `
                <div class="clinical-item">
                    <div class="clinical-item-name">
                        <span class="badge-allergy">ALLERGY</span> ${allergen}
                    </div>
                    ${reaction ? `<div class="clinical-item-detail">Reaction: ${reaction}</div>` : ''}
                    <div class="clinical-item-detail">
                        <span class="badge-severity">Severity: ${severity.toUpperCase()}</span>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Error loading allergies:', error);
        document.getElementById('allergiesList').innerHTML = 
            '<div class="empty-state">Unable to load allergies</div>';
    }
}

/**
 * Load and display medications
 */
async function loadMedications(client) {
    try {
        console.log('📥 Fetching medications...');
        
        const response = await client.request(
            `MedicationRequest?patient=${client.patient.id}&status=active&_sort=-authoredOn&_count=20`,
            { flat: true }
        );
        
        console.log('✅ Medications response:', response);
        
        const medicationsList = document.getElementById('medicationsList');
        let medications = [];
        
        if (response.resourceType === 'Bundle' && response.entry) {
            medications = response.entry.map(entry => entry.resource);
        } else if (Array.isArray(response)) {
            medications = response;
        }
        
        console.log(`💊 Found ${medications.length} medications`);
        
        if (medications.length === 0) {
            medicationsList.innerHTML = '<div class="empty-state">No active medications</div>';
            return;
        }
        
        medicationsList.innerHTML = medications.map(med => {
            const medName = getMedicationName(med);
            const dosage = getDosageInstruction(med);
            const date = med.authoredOn ? new Date(med.authoredOn).toLocaleDateString() : 'Unknown date';
            
            return `
                <div class="clinical-item">
                    <div class="clinical-item-name">${medName}</div>
                    ${dosage ? `<div class="clinical-item-detail">${dosage}</div>` : ''}
                    <div class="clinical-item-date">Prescribed: ${date}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Error loading medications:', error);
        document.getElementById('medicationsList').innerHTML = 
            '<div class="empty-state">Unable to load medications</div>';
    }
}

/**
 * Load and display conditions
 */
async function loadConditions(client) {
    try {
        console.log('📥 Fetching conditions...');
        
        const response = await client.request(
            `Condition?patient=${client.patient.id}&_sort=-recordedDate&_count=20`,
            { flat: true }
        );
        
        console.log('✅ Conditions response:', response);
        
        const conditionsList = document.getElementById('conditionsList');
        let conditions = [];
        
        if (response.resourceType === 'Bundle' && response.entry) {
            conditions = response.entry.map(entry => entry.resource);
        } else if (Array.isArray(response)) {
            conditions = response;
        }
        
        console.log(`🏥 Found ${conditions.length} conditions`);
        
        if (conditions.length === 0) {
            conditionsList.innerHTML = '<div class="empty-state">No documented conditions</div>';
            return;
        }
        
        conditionsList.innerHTML = conditions.map(condition => {
            const conditionName = getConditionName(condition);
            const status = condition.clinicalStatus?.coding?.[0]?.code || 'unknown';
            const date = condition.recordedDate ? new Date(condition.recordedDate).toLocaleDateString() : 
                        (condition.onsetDateTime ? new Date(condition.onsetDateTime).toLocaleDateString() : 'Unknown date');
            
            return `
                <div class="clinical-item">
                    <div class="clinical-item-name">${conditionName}</div>
                    <div class="clinical-item-detail">Status: ${status}</div>
                    <div class="clinical-item-date">Recorded: ${date}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Error loading conditions:', error);
        document.getElementById('conditionsList').innerHTML = 
            '<div class="empty-state">Unable to load conditions</div>';
    }
}

/**
 * Load and display vital signs
 */
async function loadVitalSigns(client) {
    try {
        console.log('📥 Fetching vital signs...');
        
        const response = await client.request(
            `Observation?patient=${client.patient.id}&category=vital-signs&_sort=-date&_count=20`,
            { flat: true }
        );
        
        console.log('✅ Vital signs response:', response);
        
        const vitalsList = document.getElementById('vitalsList');
        let vitals = [];
        
        if (response.resourceType === 'Bundle' && response.entry) {
            vitals = response.entry.map(entry => entry.resource);
        } else if (Array.isArray(response)) {
            vitals = response;
        }
        
        console.log(`📊 Found ${vitals.length} vital signs`);
        
        if (vitals.length === 0) {
            vitalsList.innerHTML = '<div class="empty-state">No recent vital signs</div>';
            return;
        }
        
        // Group by type and show most recent of each
        const vitalsByType = {};
        vitals.forEach(vital => {
            const type = getVitalType(vital);
            if (!vitalsByType[type]) {
                vitalsByType[type] = vital;
            }
        });
        
        vitalsList.innerHTML = Object.values(vitalsByType).map(vital => {
            const vitalName = getVitalType(vital);
            const value = getVitalValue(vital);
            const date = vital.effectiveDateTime ? new Date(vital.effectiveDateTime).toLocaleDateString() : 'Unknown date';
            
            return `
                <div class="clinical-item">
                    <div class="clinical-item-name">${vitalName}</div>
                    <div class="clinical-item-detail">${value}</div>
                    <div class="clinical-item-date">${date}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Error loading vital signs:', error);
        document.getElementById('vitalsList').innerHTML = 
            '<div class="empty-state">Unable to load vital signs</div>';
    }
}

/**
 * Load and display clinical documents with view buttons
 */
async function loadDocuments(client) {
    try {
        console.log('📥 Fetching documents...');
        
        const response = await client.request(
            `DocumentReference?patient=${client.patient.id}&_sort=-date&_count=50`,
            { pageLimit: 0, flat: true }
        );
        
        console.log('✅ Documents response:', response);
        
        const documentsList = document.getElementById('documentsList');
        let documents = [];
        
        if (response.resourceType === 'Bundle' && response.entry) {
            documents = response.entry.map(entry => entry.resource);
        } else if (Array.isArray(response)) {
            documents = response;
        }
        
        console.log(`📄 Found ${documents.length} documents`);
        
        if (documents.length === 0) {
            documentsList.innerHTML = '<div class="empty-state">No clinical documents found for this patient.</div>';
            return;
        }
        
        documentsList.innerHTML = documents.map((doc, index) => {
            return createDocumentCard(doc, index);
        }).join('');
        
    } catch (error) {
        console.error('❌ Error loading documents:', error);
        document.getElementById('documentsList').innerHTML = 
            '<div class="empty-state">Unable to load documents. This may be due to permissions or data availability.</div>';
    }
}

/**
 * Create HTML for a document card with view and summarize buttons
 */
function createDocumentCard(doc, index) {
    const docType = getDocumentType(doc);
    const docDate = getDocumentDate(doc);
    const description = doc.description || '';
    const status = doc.status || 'current';
    const statusClass = status === 'current' ? 'status-current' : '';
    const author = getDocumentAuthor(doc);
    const category = getDocumentCategory(doc);
    
    // Check if document has viewable content
    const hasContent = doc.content && doc.content.length > 0;
    
    return `
        <div class="document-card">
            <div class="document-header">
                <div>
                    <div class="document-type">${escapeHtml(docType)}</div>
                    ${category ? `<div style="font-size: 13px; color: #7f8c8d; margin-top: 4px;">${escapeHtml(category)}</div>` : ''}
                </div>
                <div class="document-date">${docDate}</div>
            </div>
            
            ${description ? `<div class="document-description">${escapeHtml(description)}</div>` : ''}
            
            <div class="document-meta">
                <span class="status-badge ${statusClass}">${status.toUpperCase()}</span>
                ${author ? `<span>👤 ${escapeHtml(author)}</span>` : ''}
                ${doc.id ? `<span>ID: ${doc.id}</span>` : ''}
            </div>
            
            ${hasContent ? `
                <div>
                    <button class="view-button" onclick="viewDocument('${doc.id}', ${index})">
                        👁️ View Document
                    </button>
                    <button class="summarize-button" onclick="summarizeDocument('${doc.id}', ${index})" id="summarize-${index}">
                        ✨ AI Summary
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * View document content in modal
 */
async function viewDocument(docId, index) {
    console.log(`📖 Viewing document: ${docId}`);
    
    if (!globalClient) {
        alert('FHIR client not ready');
        return;
    }
    
    try {
        // Fetch the full document
        const doc = await globalClient.request(`DocumentReference/${docId}`);
        
        console.log('Document details:', doc);
        
        // Get document content
        if (!doc.content || doc.content.length === 0) {
            alert('No content available for this document');
            return;
        }
        
        const content = doc.content[0];
        const attachment = content.attachment;
        
        // Set modal title
        const docType = getDocumentType(doc);
        document.getElementById('modalDocumentTitle').textContent = docType;
        
        const modalContent = document.getElementById('modalDocumentContent');
        
        // Handle different content types
        if (attachment.contentType === 'text/plain' || attachment.contentType === 'text/html') {
            // Text content - fetch and display
            if (attachment.url) {
                try {
                    const textResponse = await fetch(attachment.url, {
                        headers: {
                            'Authorization': `Bearer ${globalClient.state.tokenResponse.access_token}`
                        }
                    });
                    const text = await textResponse.text();
                    modalContent.innerHTML = `<div class="document-content">${escapeHtml(text)}</div>`;
                } catch (error) {
                    console.error('Error fetching document text:', error);
                    modalContent.innerHTML = `<div class="error">Unable to fetch document content</div>`;
                }
            } else if (attachment.data) {
                // Base64 encoded data
                const decoded = atob(attachment.data);
                modalContent.innerHTML = `<div class="document-content">${escapeHtml(decoded)}</div>`;
            }
        } else if (attachment.contentType === 'application/pdf') {
            // PDF - show link to open in new tab
            if (attachment.url) {
                modalContent.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <p style="margin-bottom: 20px;">This is a PDF document.</p>
                        <a href="${attachment.url}" target="_blank" class="view-button">
                            📄 Open PDF in New Tab
                        </a>
                    </div>
                `;
            }
        } else {
            modalContent.innerHTML = `<div class="error">Content type ${attachment.contentType} not supported for inline viewing</div>`;
        }
        
        // Show modal
        document.getElementById('documentModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error viewing document:', error);
        alert('Failed to load document: ' + error.message);
    }
}

/**
 * Close document modal
 */
function closeDocumentModal() {
    document.getElementById('documentModal').style.display = 'none';
}

/**
 * Summarize document using Claude API
 * This function calls Claude AI to generate a summary of the clinical document
 */
async function summarizeDocument(docId, index) {
    console.log(`✨ Summarizing document: ${docId}`);
    
    if (!globalClient) {
        alert('FHIR client not ready');
        return;
    }
    
    // Disable button and show loading
    const button = document.getElementById(`summarize-${index}`);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '⏳ Summarizing...';
    
    try {
        // Fetch the full document
        const doc = await globalClient.request(`DocumentReference/${docId}`);
        
        // Get document content
        if (!doc.content || doc.content.length === 0) {
            alert('No content available to summarize');
            button.disabled = false;
            button.textContent = originalText;
            return;
        }
        
        const content = doc.content[0];
        const attachment = content.attachment;
        
        let documentText = '';
        
        // Extract text from document
        if (attachment.contentType === 'text/plain' || attachment.contentType === 'text/html') {
            if (attachment.url) {
                const textResponse = await fetch(attachment.url, {
                    headers: {
                        'Authorization': `Bearer ${globalClient.state.tokenResponse.access_token}`
                    }
                });
                documentText = await textResponse.text();
            } else if (attachment.data) {
                documentText = atob(attachment.data);
            }
        } else {
            alert('Can only summarize text documents');
            button.disabled = false;
            button.textContent = originalText;
            return;
        }
        
        if (!documentText || documentText.trim().length === 0) {
            alert('Document has no text content to summarize');
            button.disabled = false;
            button.textContent = originalText;
            return;
        }
        
        // Call Claude API for summarization
        const summary = await callClaudeAPI(documentText);
        
        // Display summary in modal
        const docType = getDocumentType(doc);
        document.getElementById('modalDocumentTitle').textContent = `${docType} - AI Summary`;
        
        const modalContent = document.getElementById('modalDocumentContent');
        modalContent.innerHTML = `
            <div class="summary-section">
                <h3>📝 AI-Generated Summary</h3>
                <div class="summary-text">${summary}</div>
            </div>
            <div class="document-content">${escapeHtml(documentText)}</div>
        `;
        
        // Show modal
        document.getElementById('documentModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error summarizing document:', error);
        alert('Failed to summarize document: ' + error.message);
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

/**
 * Call Claude API to generate summary
 * In a production app, this would go through your backend server to keep API keys secure
 * For this demo, we're using a client-side approach (you'll need to add your API key)
 */
async function callClaudeAPI(documentText) {
    // IMPORTANT: In production, never expose API keys in client-side code!
    // This should be done through a backend server endpoint
    
    // For this demo, we'll use a simple extraction algorithm as a fallback
    // You can replace this with an actual API call to Claude or another NLP service
    
    const summary = generateSimpleSummary(documentText);
    return summary;
}

/**
 * Generate a simple extractive summary
 * This is a basic NLP algorithm that extracts key sentences
 */
function generateSimpleSummary(text) {
    // Clean and split into sentences
    const sentences = text
        .replace(/\r\n/g, '\n')
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20); // Filter out very short sentences
    
    if (sentences.length === 0) {
        return 'Unable to generate summary - no complete sentences found.';
    }
    
    // Score sentences based on key medical terms
    const keyTerms = [
        'diagnosis', 'diagnosed', 'patient', 'treatment', 'procedure', 'prescribed',
        'history', 'examination', 'assessment', 'plan', 'recommendation', 'findings',
        'complaint', 'symptoms', 'condition', 'admitted', 'discharged', 'medications',
        'allergies', 'vital signs', 'labs', 'imaging', 'results', 'follow-up'
    ];
    
    const scoredSentences = sentences.map(sentence => {
        const lowerSentence = sentence.toLowerCase();
        let score = 0;
        
        // Score based on keyword presence
        keyTerms.forEach(term => {
            if (lowerSentence.includes(term)) {
                score += 1;
            }
        });
        
        // Bonus for sentences near the beginning (often contain chief complaint/diagnosis)
        const position = sentences.indexOf(sentence);
        if (position < 3) score += 2;
        
        // Bonus for medium-length sentences (not too short, not too long)
        const wordCount = sentence.split(/\s+/).length;
        if (wordCount >= 10 && wordCount <= 30) score += 1;
        
        return { sentence, score };
    });
    
    // Sort by score and take top 3-5 sentences
    scoredSentences.sort((a, b) => b.score - a.score);
    const topSentences = scoredSentences.slice(0, Math.min(5, Math.ceil(sentences.length * 0.2)));
    
    // Re-order by original position for coherent summary
    const selectedSentences = topSentences
        .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence))
        .map(s => s.sentence);
    
    if (selectedSentences.length === 0) {
        return 'Unable to generate summary from this document.';
    }
    
    // Create summary with sections
    let summary = '<strong>Key Points:</strong><br><br>';
    selectedSentences.forEach((sentence, i) => {
        summary += `${i + 1}. ${sentence}.<br><br>`;
    });
    
    summary += `<em style="color: #7f8c8d;">Summary generated using extractive text analysis (${selectedSentences.length} key sentences from ${sentences.length} total sentences)</em>`;
    
    return summary;
}

// Helper functions for extracting data from FHIR resources

function getAllergen(allergy) {
    if (allergy.code?.text) return allergy.code.text;
    if (allergy.code?.coding?.[0]?.display) return allergy.code.coding[0].display;
    return 'Unknown allergen';
}

function getReactions(allergy) {
    if (!allergy.reaction || allergy.reaction.length === 0) return null;
    const manifestations = allergy.reaction[0].manifestation;
    if (!manifestations || manifestations.length === 0) return null;
    return manifestations.map(m => m.text || m.coding?.[0]?.display).filter(Boolean).join(', ');
}

function getMedicationName(med) {
    if (med.medicationCodeableConcept?.text) return med.medicationCodeableConcept.text;
    if (med.medicationCodeableConcept?.coding?.[0]?.display) return med.medicationCodeableConcept.coding[0].display;
    if (med.medicationReference?.display) return med.medicationReference.display;
    return 'Unknown medication';
}

function getDosageInstruction(med) {
    if (!med.dosageInstruction || med.dosageInstruction.length === 0) return null;
    const dosage = med.dosageInstruction[0];
    return dosage.text || null;
}

function getConditionName(condition) {
    if (condition.code?.text) return condition.code.text;
    if (condition.code?.coding?.[0]?.display) return condition.code.coding[0].display;
    return 'Unknown condition';
}

function getVitalType(vital) {
    if (vital.code?.text) return vital.code.text;
    if (vital.code?.coding?.[0]?.display) return vital.code.coding[0].display;
    return 'Vital Sign';
}

function getVitalValue(vital) {
    if (vital.valueQuantity) {
        return `${vital.valueQuantity.value} ${vital.valueQuantity.unit || ''}`;
    }
    if (vital.component && vital.component.length > 0) {
        // For blood pressure and similar multi-component vitals
        return vital.component.map(c => {
            const name = c.code?.text || c.code?.coding?.[0]?.display || '';
            const value = c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit || ''}` : '';
            return `${name}: ${value}`;
        }).join(', ');
    }
    return 'No value';
}

function getDocumentType(doc) {
    if (doc.type?.coding?.[0]?.display) return doc.type.coding[0].display;
    if (doc.type?.text) return doc.type.text;
    return 'Clinical Document';
}

function getDocumentDate(doc) {
    if (doc.date) {
        const date = new Date(doc.date);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    if (doc.context?.period?.start) {
        const date = new Date(doc.context.period.start);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    return 'Unknown date';
}

function getDocumentAuthor(doc) {
    if (doc.author && doc.author.length > 0) {
        return doc.author[0].display || null;
    }
    return null;
}

function getDocumentCategory(doc) {
    if (doc.category?.[0]?.coding?.[0]?.display) return doc.category[0].coding[0].display;
    if (doc.category?.[0]?.text) return doc.category[0].text;
    return null;
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    console.error('Error displayed to user:', message);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    const modal = document.getElementById('documentModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

/**
 * Open PDF with authentication in new tab
 */
async function openPdfInNewTab(url) {
    try {
        if (!globalClient) {
            alert('FHIR client not ready');
            return;
        }
        
        // Fetch PDF with authentication
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${globalClient.state.tokenResponse.access_token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
        }
        
        // Get PDF as blob
        const blob = await response.blob();
        
        // Create object URL
        const pdfUrl = URL.createObjectURL(blob);
        
        // Open in new tab
        window.open(pdfUrl, '_blank');
        
    } catch (error) {
        console.error('Error opening PDF:', error);
        alert('Failed to open PDF: ' + error.message);
    }
}
