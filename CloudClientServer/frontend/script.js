
"use strict";

// AWS CONFIGURATION
const serverUrl = "https://f31ghupffk.execute-api.us-east-2.amazonaws.com";
const cognitoDomain = "https://us-east-2069jnkos1.auth.us-east-2.amazoncognito.com";
const clientId = "120im081ii0g1km243nf24g21h";
const redirectUri = "https://d25nl96y7vbx79.cloudfront.net";

// HTML ELEMENTS
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userGreeting = document.getElementById("user-greeting");

const loadDataBtn = document.getElementById("load-data-btn");
const serverResponse = document.getElementById("server-response");

const sendDataForm = document.getElementById("send-data-form");
const dataInput = document.getElementById("data-input");
const sendDataResponse = document.getElementById("send-data-response");


// AUTHENTICATION HEADERS
function getAuthHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + sessionStorage.getItem("access_token")
    };
}


// LOGIN USING COGNITO AND PKCE
loginBtn.addEventListener("click", async () => {
    const random = () => {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        return btoa(String.fromCharCode(...bytes))
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    };

    const verifier = random();
    const state = random();

    sessionStorage.setItem("verifier", verifier);
    sessionStorage.setItem("state", state);

    const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
    );

    const challenge = btoa(
        String.fromCharCode(...new Uint8Array(hash))
    ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const url = new URL(`${cognitoDomain}/oauth2/authorize`);

    url.search = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        scope: "openid email",
        redirect_uri: redirectUri,
        code_challenge_method: "S256",
        code_challenge: challenge,
        state: state
    });

    location.href = url;
});


// COMPLETE LOGIN
async function finishLogin() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");

    if (!code) return;

    if (params.get("state") !== sessionStorage.getItem("state")) {
        throw new Error("Invalid login state.");
    }

    const response = await fetch(`${cognitoDomain}/oauth2/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            code: code,
            redirect_uri: redirectUri,
            code_verifier: sessionStorage.getItem("verifier")
        })
    });

    const tokens = await response.json();

    if (!response.ok) throw new Error("Login failed.");

    sessionStorage.setItem("id_token", tokens.id_token);
    sessionStorage.setItem("access_token", tokens.access_token);

    sessionStorage.removeItem("verifier");
    sessionStorage.removeItem("state");

    history.replaceState({}, document.title, redirectUri);
}


// DISPLAY USER
function displayUser() {
    const token = sessionStorage.getItem("id_token");

    if (!token) {
        userGreeting.textContent = "You are not logged in.";
        loginBtn.hidden = false;
        logoutBtn.hidden = true;
        return;
    }

    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");

    const claims = JSON.parse(
        decodeURIComponent(
            Array.from(atob(base64))
                .map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
                .join("")
        )
    );

    if (claims.exp * 1000 <= Date.now()) {
        sessionStorage.clear();
        location.reload();
        return;
    }

    userGreeting.textContent = `Hello, ${claims.email || "User"}!`;
    loginBtn.hidden = true;
    logoutBtn.hidden = false;
}


// LOGOUT
logoutBtn.addEventListener("click", () => {
    sessionStorage.clear();

    const url = new URL(`${cognitoDomain}/logout`);

    url.search = new URLSearchParams({
        client_id: clientId,
        logout_uri: redirectUri
    });

    location.href = url;
});


// INPUT SANITIZATION
function sanitizeInput(value) {
    return value.trim().replace(/[\u0000-\u001F\u007F]/g, "");
}


// LOAD DATA FROM DYNAMODB
loadDataBtn.addEventListener("click", async () => {
    try {
        serverResponse.textContent = "Loading messages...";

        const response = await fetch(`${serverUrl}/api/data`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ request: "data" })
        });

        const result = await response.json();

        if (!response.ok) throw new Error("Unable to load data.");

        serverResponse.textContent = result.data?.length
            ? result.message + "\n" + result.data.map(
                item => `${item.data} (${item.createdAt})`
            ).join("\n")
            : "No messages found.";

    } catch (error) {
        console.error(error);
        serverResponse.textContent = "Unable to connect to the server.";
    }
});


// SEND DATA TO DYNAMODB
sendDataForm.addEventListener("submit", async event => {
    event.preventDefault();

    const message = sanitizeInput(dataInput.value);

    if (!message || message.length > 500) {
        sendDataResponse.textContent =
            "Please enter a message between 1 and 500 characters.";
        return;
    }

    try {
        const response = await fetch(`${serverUrl}/api/message`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ data: message })
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.message);

        sendDataResponse.textContent =
            result.message + " " + result.receivedData;

        dataInput.value = "";

    } catch (error) {
        console.error(error);
        sendDataResponse.textContent = "Unable to connect to the server.";
    }
});


// START APPLICATION
finishLogin()
    .then(displayUser)
    .catch(error => {
        console.error(error);
        userGreeting.textContent = "Login failed. Please try again.";
    });
