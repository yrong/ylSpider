(async() => {
    const nifa = require('../nifa')
    let data = await nifa.gather()
    console.log(data)
})();
