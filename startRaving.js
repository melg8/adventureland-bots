// ============================================================================
// Adventure Land code to start a character on the local crabrave server
// ============================================================================
//
// HOW TO GET YOUR CREDENTIALS (user_id and user_auth)
// ============================================================================
// 
// 1. Log into Adventure Land with the account you want to get credentials for
// 
// 2. Open the code editor in-game (press 'J' or click the code icon)
// 
// 3. Paste and run this code:
// 
//    console.log("user_id:", parent.user_id)
//    console.log("user_auth:", parent.user_auth)
// 
// 4. Open your browser's developer console (F12)
// 
// 5. Copy the values from the console output
// 
// 6. Use these values in your crabrave_local.ts configuration
// 
// ============================================================================

async function startRaving(name, url = 'http://127.0.0.1:8092/') {
    if (!parent.X) throw new Error("Couldn't find `X` data!")
    if (!parent.user_id) throw new Error("Couldn't find `parent.user_id`!")
    if (!parent.user_auth) throw new Error("Couldn't find `parent.user_auth`!")

    const xData = parent.X.characters.find(x => x.name == name)
    if (!xData) throw new Error(`Couldn't find a character with the name ${name}!`)
    if (xData.online) throw new Error(`It looks like ${name} is already online!`)

    const result = await fetch(url, {
        "credentials": "omit",
        "headers": {
            "Content-Type": "application/json",
        },
        "referrer": url,
        "body": JSON.stringify({
            "user": parent.user_id,
            "auth": parent.user_auth,
            "char": xData.id,
            "char_type": xData.type
        }),
        "method": "POST"
    })
    return result.text()
}

// Usage: Copy the startRaving function to Adventure Land code editor and run:
// show_json(await startRaving("Lucky2"))
