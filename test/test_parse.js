const path = require('path')
const fs = require('fs')
const parse = require('../parse')
const specificDir = './download/all'
let result, specificFile = 'loanagreement_9122875.pdf';

(async () => {
    const files = await fs.readdirSync(specificDir);
    let parseFile = async (file) => {
        const filepath = path.join(specificDir, file);
        let result = await parse.parsePdf(filepath)
        return result
    }
    for (let file of files) {
        if (file.match(/^loanagreement_(.*)\.pdf$/)) {
            if (specificFile) {
                if (file === specificFile) {
                    result = await parseFile(file)
                    console.log(JSON.stringify(result.lines, null, 2))
                    console.log(JSON.stringify(result.parsed, null, 2))
                }
            } else {
                result = await parseFile(file)
                console.log(JSON.stringify(result.parsed, null, 2))
            }
        }
    }

})().catch((e) => {
    console.log(e)
})
