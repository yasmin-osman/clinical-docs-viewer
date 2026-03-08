// app.js

// Initialize the SMART on FHIR client
FHIR.oauth2.ready()
    .then(client => {
        console.log('SMART client ready');
        console.log('Patient ID:', client.patient.id);
        
        // Fetch patient data and documents in parallel
        Promise.all([
            loadPatientData(client),
            loadDocuments(client)
        ])
        .then(() => {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('content').style.display = 'block';
        })
        .catch(error => {
            showError('Failed to load data: ' + error.message);
        });
    })
    .catch(error => {
        showError('Authorization failed: ' + error.message);
    });

/**
 * Load and display patient demographic information
 */
async function loadPatientData(client) {
    try {
        // Request patient resource from FHIR server
        const patient = await client.request(`Patient/${client.patient.id}`);
        
        console.log('Patient data:', patient);
        
        // Extract and display patient name
        if (patient.name && patient.name.length > 0) {
            const name = patient.name[0];
            const fullName = [
                name.prefix ? name.prefix.join(' ') : '',
                name.given ? name.given.join(' ') : '',
                name.family || ''
            ].filter(Boolean).join(' ');
            
            document.getElementById('patientName').textContent = fullName;
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
        }
        
        // Display gender
        if (patient.gender) {
            const gender = patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1);
            document.getElementById('patientGender').textContent = gender;
        }
        
        // Display Medical Record Number (MRN)
        if (patient.identifier && patient.identifier.length > 0) {
            // Look for MRN in identifiers
            const mrnIdentifier = patient.identifier.find(id => 
                id.type && id.type.coding && 
                id.type.coding.some(c => c.code === 'MR')
            );
            
            if (mrnIdentifier && mrnIdentifier.value) {
                document.getElementById('patientMRN').textContent = mrnIdentifier.value;
            }
        }
        
    } catch (error) {
        console.error('Error loading patient data:', error);
        throw error;
    }
}

/**
 * Load and display clinical documents
 */
async function loadDocuments(client) {
    try {
        // Query DocumentReference resources for the patient
        const response = await client.request(
            `DocumentReference?patient=${client.patient.id}&_sort=-date&_count=50`,
            {
                pageLimit: 0,  // Don't follow pagination for this demo
                flat: true      // Return flat array of resources
            }
        );
        
        console.log('Documents response:', response);
        
        const documentsList = document.getElementById('documentsList');
        
        // Handle both Bundle format and direct array
        let documents = [];
        if (response.resourceType === 'Bundle' && response.entry) {
            documents = response.entry.map(entry => entry.resource);
        } else if (Array.isArray(response)) {
            documents = response;
        }
        
        if (documents.length === 0) {
            documentsList.innerHTML = `
                <div class="empty-state">
                    <p>No clinical documents found for this patient.</p>
                </div>
            `;
            return;
        }
        
        // Display each document
        documentsList.innerHTML = documents.map(doc => {
            return createDocumentCard(doc);
        }).join('');
        
    } catch (error) {
        console.error('Error loading documents:', error);
        
        // Show a message if documents can't be loaded
        const documentsList = document.getElementById('documentsList');
        documentsList.innerHTML = `
            <div class="empty-state">
                <p>Unable to load documents. This may be due to permissions or data availability.</p>
            </div>
        `;
    }
}

/**
 * Create HTML for a document card
 */
function createDocumentCard(doc) {
    // Get document type/category
    let docType = 'Clinical Document';
    if (doc.type && doc.type.coding && doc.type.coding.length > 0) {
        docType = doc.type.coding[0].display || doc.type.text || docType;
    } else if (doc.type && doc.type.text) {
        docType = doc.type.text;
    }
    
    // Get document date
    let docDate = 'Unknown date';
    if (doc.date) {
        const date = new Date(doc.date);
        docDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } else if (doc.context && doc.context.period && doc.context.period.start) {
        const date = new Date(doc.context.period.start);
        docDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    
    // Get description
    let description = '';
    if (doc.description) {
        description = doc.description;
    } else if (doc.content && doc.content.length > 0 && doc.content[0].attachment) {
        description = doc.content[0].attachment.title || '';
    }
    
    // Get status
    const status = doc.status || 'current';
    const statusClass = status === 'current' ? 'status-current' : '';
    
    // Get author
    let author = '';
    if (doc.author && doc.author.length > 0) {
        const authorRef = doc.author[0];
        if (authorRef.display) {
            author = authorRef.display;
        }
    }
    
    // Get document category
    let category = '';
    if (doc.category && doc.category.length > 0 && doc.category[0].coding) {
        category = doc.category[0].coding[0].display || doc.category[0].text || '';
    }
    
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
                <span class="status-badge ${statusClass}">
                    ${status.toUpperCase()}
                </span>
                ${author ? `<span>👤 ${escapeHtml(author)}</span>` : ''}
                ${doc.id ? `<span>ID: ${doc.id}</span>` : ''}
            </div>
        </div>
    `;
}

/**
 * Display error message
 */
function showError(message) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    console.error(message);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

