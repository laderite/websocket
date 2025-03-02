// Main application JavaScript for Ethos Suite Websockets UI
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication first
    const authToken = localStorage.getItem('ethosAuth');
    if (!authToken) {
        // Not authenticated, redirect to login page
        window.location.href = '/login.html';
        return;
    }

    // Add logout functionality
    const addLogoutButton = () => {
        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
            const logoutBtn = document.createElement('button');
            logoutBtn.className = 'icon-button';
            logoutBtn.title = 'Logout';
            logoutBtn.innerHTML = '<i class="bi bi-box-arrow-right"></i>';
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('ethosAuth');
                window.location.href = '/login.html';
            });
            headerActions.appendChild(logoutBtn);
        }
    };
    
    // DOM Elements with fallbacks
    let clientsList = document.getElementById('clients-list');
    if (!clientsList) {
        clientsList = document.createElement('div');
        clientsList.id = 'clients-list';
        document.body.appendChild(clientsList);
    }
    
    let targetSelect = document.getElementById('target');
    if (!targetSelect) {
        targetSelect = document.createElement('select');
        targetSelect.id = 'target';
        document.body.appendChild(targetSelect);
    }
    
    let commandForm = document.getElementById('command-form');
    if (!commandForm) {
        commandForm = document.createElement('form');
        commandForm.id = 'command-form';
        document.body.appendChild(commandForm);
    }
    
    let commandInput = document.getElementById('command');
    if (!commandInput) {
        commandInput = document.createElement('input');
        commandInput.id = 'command';
        commandInput.type = 'text';
        commandForm.appendChild(commandInput);
    }
    
    let paramsInput = document.getElementById('params');
    if (!paramsInput) {
        paramsInput = document.createElement('textarea');
        paramsInput.id = 'params';
        commandForm.appendChild(paramsInput);
    }
    
    let searchInput = document.getElementById('search-clients');
    if (!searchInput) {
        searchInput = document.createElement('input');
        searchInput.id = 'search-clients';
        searchInput.type = 'search';
        document.body.appendChild(searchInput);
    }
    
    let connectionStatus = document.getElementById('connection-status');
    if (!connectionStatus) {
        connectionStatus = document.createElement('div');
        connectionStatus.id = 'connection-status';
        document.body.appendChild(connectionStatus);
    }
    
    let connectionIndicator = document.getElementById('connection-indicator');
    if (!connectionIndicator) {
        connectionIndicator = document.createElement('div');
        connectionIndicator.id = 'connection-indicator';
        connectionStatus.appendChild(connectionIndicator);
    }
    
    let clientCount = document.getElementById('client-count');
    if (!clientCount) {
        clientCount = document.createElement('span');
        clientCount.id = 'client-count';
        if (connectionStatus) {
            connectionStatus.appendChild(clientCount);
        } else {
            document.body.appendChild(clientCount);
        }
    }
    
    let refreshBtn = document.getElementById('refresh-btn');
    if (!refreshBtn) {
        refreshBtn = document.createElement('button');
        refreshBtn.id = 'refresh-btn';
        refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
        refreshBtn.className = 'icon-button';
        refreshBtn.title = 'Refresh client list';
        document.body.appendChild(refreshBtn);
    }
    
    // WebSocket connection
    let ws = null;
    
    // Store clients data
    let clientsData = [];
    
    // Initialize the tabs for sections
    function initTabs() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and contents
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // Add active class to clicked tab and corresponding content
                tab.classList.add('active');
                const tabId = tab.getAttribute('data-tab');
                document.getElementById(tabId).classList.add('active');
            });
        });
    }
    
    // Format time
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    
    // Show a toast notification
    function showToast(message, type = 'success') {
        // Skip toast messages related to server connection
        if (message.includes('Connected to server')) {
            return;
        }
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<div class="toast-content">${message}</div>`;
        document.body.appendChild(toast);
        
        // Force reflow
        toast.offsetHeight;
        
        // Show toast
        toast.classList.add('show');
        
        // Hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
    
    // Update connection status
    function updateConnectionStatus(isConnected) {
        if (connectionStatus && connectionIndicator) {
            connectionStatus.classList.remove('connected', 'disconnected');
            connectionStatus.classList.add(isConnected ? 'connected' : 'disconnected');
            
            connectionIndicator.innerHTML = isConnected ? 
                '<i class="bi bi-wifi"></i>' : 
                '<i class="bi bi-wifi-off"></i>';
                
            // Call server status endpoint to check if server is running
            fetch('/status', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include' // Include cookies in the request
            })
                .then(response => {
                    if (response.status === 200) {
                        connectionStatus.classList.add('connected');
                        connectionIndicator.innerHTML = '<i class="bi bi-wifi"></i>';
                    } else if (response.status === 401) {
                        // Unauthorized - token expired or invalid
                        localStorage.removeItem('ethosAuth');
                        window.location.href = '/login.html';
                    } else {
                        connectionStatus.classList.add('disconnected');
                        connectionIndicator.innerHTML = '<i class="bi bi-wifi-off"></i>';
                        showToast('Problem connecting to server', 'error');
                    }
                })
                .catch(error => {
                    console.error('Server status check failed:', error);
                    connectionStatus.classList.add('disconnected');
                    connectionIndicator.innerHTML = '<i class="bi bi-wifi-off"></i>';
                    showToast('Failed to connect to server', 'error');
                });
        }
    }
    
    // Fetch and display connected clients
    function updateClients() {
        // Show loading state
        if (clientsList) {
            clientsList.innerHTML = '<div class="loading">Loading clients...</div>';
        }
        
        fetch('/clients', {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include' // Include cookies in the request
        })
            .then(response => {
                if (response.status === 401) {
                    // Unauthorized - token expired or invalid
                    localStorage.removeItem('ethosAuth');
                    window.location.href = '/login.html';
                    throw new Error('Unauthorized');
                }
                return response.json();
            })
            .then(clients => {
                // Direct update of client count
                if (clientCount) {
                    clientCount.textContent = clients.length;
                }
                
                // Direct update of clients list
                if (clientsList) {
                    
                    if (clients.length === 0) {
                        clientsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>No clients connected</p></div>';
                    } else {
                        // Clear the list
                        clientsList.innerHTML = '';
                        
                        // Directly render each client without additional filtering
                        clients.forEach(client => {
                            const clientItem = document.createElement('div');
                            clientItem.className = 'client-item';
                            clientItem.dataset.clientId = client.id;
                            clientItem.dataset.collapsed = 'true';
                            
                            // Create the HTML for the client item with compact layout
                            clientItem.innerHTML = `
                                <div class="client-card">
                                    <div class="client-main">
                                        <div class="client-info">
                                            <div class="client-name">
                                                ${client.username}
                                                <span class="badge badge-success">CONNECTED</span>
                                            </div>
                                            <div class="client-actions">
                                                <button class="btn btn-sm btn-icon message-btn" data-id="${client.id}" title="Send Message">
                                                    <i class="bi bi-chat"></i>
                                                </button>
                                                <button class="btn btn-sm btn-icon btn-danger kick-btn" data-id="${client.id}" title="Kick Client">
                                                    <i class="bi bi-x-circle"></i>
                                                </button>
                                                <button class="btn btn-sm btn-icon toggle-btn" data-id="${client.id}" title="Toggle Details">
                                                    <i class="bi bi-chevron-down"></i>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div class="client-game">
                                            Game: <strong>${client.gameName}</strong>
                                        </div>
                                        
                                        <div class="client-metrics">
                                            <span><i class="bi bi-wifi"></i> ${client.ping}ms</span>
                                            <span><i class="bi bi-speedometer"></i> ${client.fps}</span>
                                            <span><i class="bi bi-memory"></i> ${client.memory}MB</span>
                                        </div>
                                        
                                        <div class="client-id">
                                            Client ID: ${client.id.substring(0, 8)}...
                                        </div>
                                    </div>
                                    
                                    <div class="client-details">
                                        <div class="details-grid">
                                            <div class="detail-item">
                                                <div class="detail-label">Full Client ID:</div>
                                                <div class="detail-value">${client.id}</div>
                                            </div>
                                            <div class="detail-item">
                                                <div class="detail-label">Job ID:</div>
                                                <div class="detail-value">${client.jobId || 'N/A'}</div>
                                            </div>
                                            <div class="detail-item">
                                                <div class="detail-label">User ID:</div>
                                                <div class="detail-value">${client.userId || 'N/A'}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                            
                            clientsList.appendChild(clientItem);
                            
                            // Add event listener for the toggle button
                            const toggleBtn = clientItem.querySelector('.toggle-btn');
                            if (toggleBtn) {
                                toggleBtn.addEventListener('click', () => {
                                    const isCollapsed = clientItem.dataset.collapsed === 'true';
                                    clientItem.dataset.collapsed = !isCollapsed;
                                    toggleBtn.innerHTML = isCollapsed ? 
                                        '<i class="bi bi-chevron-up"></i>' : 
                                        '<i class="bi bi-chevron-down"></i>';
                                });
                            }
                            
                            // Add event listeners for action buttons
                            const messageBtn = clientItem.querySelector('.message-btn');
                            if (messageBtn) {
                                messageBtn.addEventListener('click', () => {
                                    if (targetSelect) targetSelect.value = client.id;
                                    if (commandInput) commandInput.value = 'message';
                                    if (paramsInput) {
                                        paramsInput.value = JSON.stringify({ message: "Hello from the server!" }, null, 2);
                                        paramsInput.focus();
                                        paramsInput.select();
                                    }
                                });
                            }
                            
                            const kickBtn = clientItem.querySelector('.kick-btn');
                            if (kickBtn) {
                                kickBtn.addEventListener('click', () => {
                                    if (targetSelect) targetSelect.value = client.id;
                                    if (commandInput) commandInput.value = 'kick';
                                    if (paramsInput) {
                                        paramsInput.value = JSON.stringify({ message: "You have been kicked from the game." }, null, 2);
                                        paramsInput.focus();
                                        paramsInput.select();
                                    }
                                });
                            }
                        });
                        
                        // Update target select dropdown
                        if (targetSelect) {
                            // Make sure All Clients option exists
                            if (targetSelect.options.length === 0) {
                                const allOption = document.createElement('option');
                                allOption.value = 'all';
                                allOption.textContent = 'All Clients';
                                targetSelect.appendChild(allOption);
                            }
                            
                            // Clear previous options except 'All Clients'
                            while (targetSelect.options.length > 1) {
                                targetSelect.remove(1);
                            }
                            
                            // Add client options
                            clients.forEach(client => {
                                const option = document.createElement('option');
                                option.value = client.id;
                                option.textContent = client.username;
                                targetSelect.appendChild(option);
                            });
                        }
                    }
                }
                
                // Store clients data for other functions
                clientsData = clients;
                
                // Update connection status
                updateConnectionStatus(true);
            })
            .catch(error => {
                if (error.message !== 'Unauthorized') {
                    console.error('Error fetching clients:', error);
                    if (clientsList) {
                        clientsList.innerHTML = '<div class="error">Error loading clients</div>';
                    }
                    updateConnectionStatus(false);
                }
            });
    }
    
    // Toggle client details visibility
    function toggleClientDetails(collapsibleTrigger) {
        // Toggle expanded class on the trigger
        collapsibleTrigger.classList.toggle('expanded');
        
        // Find the collapsible content - it's a sibling of the client-details-summary
        const collapsibleContent = collapsibleTrigger.nextElementSibling;
        
        // If not found (which shouldn't happen), return
        if (!collapsibleContent || !collapsibleContent.classList.contains('collapsible-content')) {
            return;
        }
        
        // Toggle expanded class on the content
        collapsibleContent.classList.toggle('expanded');
        
        // Update icon rotation
        const icon = collapsibleTrigger.querySelector('.collapsible-icon');
        if (icon) {
            // Icon rotation is now handled by CSS
            // This just ensures the icon exists
        }
    }
    
    // Copy text to clipboard
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showToast('Copied to clipboard!', 'success');
            })
            .catch(err => {
                showToast('Failed to copy: ' + err, 'error');
            });
    }
    
    // Setup WebSocket connection for real-time updates
    function setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Include token as query parameter for WebSocket authentication
        const wsUrl = `${protocol}//${window.location.host}?token=${encodeURIComponent(authToken)}`;
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            // Register as admin to receive client updates
            ws.send(JSON.stringify({
                action: 'adminRegister',
                token: authToken
            }));
            updateConnectionStatus(true);
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.action === 'clientAdded' || data.action === 'clientRemoved') {
                    // Update clients list when a client is added or removed
                    updateClients();
                } else if (data.action === 'authError') {
                    // Authentication error
                    localStorage.removeItem('ethosAuth');
                    window.location.href = '/login.html';
                }
            } catch (e) {
                console.error('Error processing WebSocket message:', e);
            }
        };
        
        ws.onclose = () => {
            updateConnectionStatus(false);
            // Try to reconnect after 5 seconds
            setTimeout(setupWebSocket, 5000);
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus(false);
        };
    }
    
    // Handle form submission to send commands
    commandForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const target = targetSelect.value;
        const command = commandInput.value.trim();
        const params = paramsInput.value.trim() || '{}';
        
        if (!command) {
            showToast('Please enter a command', 'error');
            return;
        }
        
        try {
            const paramsObj = JSON.parse(params);
            fetch('/sendCommand', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                credentials: 'include', // Include cookies in the request
                body: JSON.stringify({ target, command, params: paramsObj })
            })
                .then(response => {
                    if (response.status === 401) {
                        // Unauthorized - token expired or invalid
                        localStorage.removeItem('ethosAuth');
                        window.location.href = '/login.html';
                        throw new Error('Unauthorized');
                    }
                    if (!response.ok) {
                        throw new Error(`HTTP error ${response.status}`);
                    }
                    showToast('Command sent successfully');
                })
                .catch(error => {
                    if (error.message !== 'Unauthorized') {
                        console.error('Error sending command:', error);
                        showToast('Error sending command: ' + error.message, 'error');
                    }
                });
        } catch (e) {
            showToast('Invalid JSON in parameters', 'error');
        }
    });
    
    // Handle search input
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            updateClients(); // Just trigger a full update for simplicity
        });
    }
    
    // Handle refresh button
    if (refreshBtn) {
        refreshBtn.addEventListener('click', updateClients);
    }
    
    // Initialize app
    function init() {
        // Add logout button
        addLogoutButton();
        
        // Initialize UI components
        initTabs();
        
        // Before everything, check server connection
        updateConnectionStatus(true);
        
        // Initial fetch of client data
        setTimeout(() => {
            updateClients();
        }, 1000);
        
        // Set theme preference in local storage
        localStorage.setItem('theme', 'dark');
        
        // Setup WebSocket connection for real-time updates
        setupWebSocket();
    }
    
    init();
});