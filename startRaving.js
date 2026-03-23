
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


show_json(await startRaving("Lucky3"))
