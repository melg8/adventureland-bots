// ============================================================================
// Adventure Land - Export Account Configuration
// ============================================================================
// 
// 1. Copy ALL of this code into Adventure Land code editor
// 2. Run it - you'll see JSON output in-game
// 3. Copy the JSON output and save it as: accounts/youraccount.json
// 4. Repeat for each account (e.g., accounts/leeroi3.json)
// 5. Run: npm run build && node build/crabrave/crabrave_local.js
// ============================================================================

function exportAccountConfig() {
    if (!parent.user_id) throw new Error("Couldn't find `parent.user_id`!")
    if (!parent.user_auth) throw new Error("Couldn't find `parent.user_auth`!")

    const chars = parent.X.characters

    // Return clean JSON configuration - copy this output and save as accounts/youraccount.json
    return {
        accountName: "leeroi" + parent.user_id.slice(-1),  // Edit this if you want a different name
        credentials: {
            userID: parent.user_id,
            userAuth: parent.user_auth
        },
        characters: chars.map((c, i) => ({
            enabled: true,           // Set to false to disable this character
            name: c.name,
            type: c.type,
            id: c.id,                // Character ID for offline login
            isPartyLeader: i === 0   // First character is party leader
        }))
    }
}

// Run this to see your account configuration
show_json(exportAccountConfig())

// ============================================================================
// Example output:
// ============================================================================
// {
//   "accountName": "leeroi2",
//   "credentials": {
//     "userID": "1234567890123456",
//     "userAuth": "abcdefghijklmnopqrs"
//   },
//   "characters": [
//     { "enabled": true, "name": "Lucky2", "type": "mage", "isPartyLeader": true },
//     { "enabled": true, "name": "Melok2", "type": "priest", "isPartyLeader": false },
//     { "enabled": true, "name": "Orca2", "type": "rogue", "isPartyLeader": false }
//   ]
// }
//
// Save this as: accounts/leeroi2.json
// ============================================================================
