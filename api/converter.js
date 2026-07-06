const A_WGS = 6378137;
const F_WGS = 1 / 298.257223563;
const E2_WGS = 2 * F_WGS - F_WGS * F_WGS;
const EP2_WGS = E2_WGS / (1 - E2_WGS);
const K0_UTM = 0.9996;
const E0_UTM = 500000;
const N0_SUL = 10000000;

function utmToDecimal(E, N, lon0) {
    N = N - N0_SUL;
    let M = N / K0_UTM;
    let mu = M / (A_WGS * (1 - E2_WGS / 4 - 3 * Math.pow(E2_WGS, 2) / 64 - 5 * Math.pow(E2_WGS, 3) / 256));
    let e1 = (1 - Math.sqrt(1 - E2_WGS)) / (1 + Math.sqrt(1 - E2_WGS));
    let e1_2 = e1 * e1, e1_3 = e1_2 * e1, e1_4 = e1_3 * e1;
    let p = mu + (3 * e1 / 2 - 27 * e1_3 / 32) * Math.sin(2 * mu) + (21 * e1_2 / 16 - 55 * e1_4 / 32) * Math.sin(4 * mu) + (151 * e1_3 / 96) * Math.sin(6 * mu);
    let C1 = EP2_WGS * Math.cos(p) * Math.cos(p);
    let T1 = Math.tan(p) * Math.tan(p);
    let N1 = A_WGS / Math.sqrt(1 - E2_WGS * Math.sin(p) * Math.sin(p));
    let R1 = A_WGS * (1 - E2_WGS) / Math.pow(1 - E2_WGS * Math.sin(p) * Math.sin(p), 1.5);
    let D = (E - E0_UTM) / (N1 * K0_UTM);
    let latRad = p - (N1 * Math.tan(p) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2_WGS) * Math.pow(D, 4) / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2_WGS - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    let lonRad = lon0 * Math.PI / 180 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2_WGS + 24 * T1 * T1) * Math.pow(D, 5) / 120) / Math.cos(p);
    return { lat: latRad * 180 / Math.PI, lon: lonRad * 180 / Math.PI };
}

function decimalToUTM(lat, lon, lon0) {
    let latRad = lat * Math.PI / 180;
    let lonRad = lon * Math.PI / 180;
    let N = A_WGS / Math.sqrt(1 - E2_WGS * Math.sin(latRad) * Math.sin(latRad));
    let T = Math.tan(latRad) * Math.tan(latRad);
    let C = EP2_WGS * Math.cos(latRad) * Math.cos(latRad);
    let A = (lonRad - lon0 * Math.PI / 180) * Math.cos(latRad);
    let M = A_WGS * ((1 - E2_WGS / 4 - 3 * Math.pow(E2_WGS, 2) / 64 - 5 * Math.pow(E2_WGS, 3) / 256) * latRad - (3 * E2_WGS / 8 + 3 * Math.pow(E2_WGS, 2) / 32 + 45 * Math.pow(E2_WGS, 3) / 1024) * Math.sin(2 * latRad) + (15 * Math.pow(E2_WGS, 2) / 256 + 45 * Math.pow(E2_WGS, 3) / 1024) * Math.sin(4 * latRad) - (35 * Math.pow(E2_WGS, 3) / 3072) * Math.sin(6 * latRad));
    let E = E0_UTM + K0_UTM * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2_WGS) * Math.pow(A, 5) / 120);
    let Ncoord = K0_UTM * (M + N * Math.tan(latRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2_WGS) * Math.pow(A, 6) / 720)) + N0_SUL;
    return { E: Math.round(E), N: Math.round(Ncoord) };
}

function extrairCoordenadas(texto) {
    let resultados = [];
    let coordsTexto = texto.trim().replace(/\s+/g, ' ').split(' ');
    for (let c of coordsTexto) {
        c = c.trim();
        if (c.includes(',') && c.split(',').length >= 2) {
            let parts = c.split(',');
            let lon = parseFloat(parts[0]);
            let lat = parseFloat(parts[1]);
            if (!isNaN(lon) && !isNaN(lat)) resultados.push({ lon, lat });
        }
    }
    return resultados;
}

function sanitizarNome(nome) {
    return nome.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 40);
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const { tipo, dados, fusoEntrada, fusoSaida, manterFuso } = req.body;

    if (tipo === 'kml') {
        let limiteFusoSaida = { min: fusoSaida - 3, max: fusoSaida + 3 };
        let placemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
        let nameRegex = /<name>([\s\S]*?)<\/name>/;
        let pointRegex = /<Point[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/;
        let lineRegex = /<LineString[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/;
        let nomes = [], coords = [], pontosScript = [], tracadosScript = [], placematch;

        while ((placematch = placemarkRegex.exec(dados)) !== null) {
            let conteudo = placematch[1];
            let nameMatch = nameRegex.exec(conteudo);
            let nome = nameMatch ? nameMatch[1].trim() : "";
            let pointMatch = pointRegex.exec(conteudo);
            if (pointMatch) {
                let encontradas = extrairCoordenadas(pointMatch[1]);
                for (let ec of encontradas) {
                    let utm;
                    let lonJaNoDestino = (ec.lon >= limiteFusoSaida.min && ec.lon <= limiteFusoSaida.max);
                    if (manterFuso && !lonJaNoDestino) utm = decimalToUTM(ec.lat, ec.lon, fusoEntrada);
                    else utm = decimalToUTM(ec.lat, ec.lon, fusoSaida);
                    nomes.push(nome); coords.push(utm.E + ',' + utm.N);
                    pontosScript.push({ nome: sanitizarNome(nome || 'PONTO'), e: utm.E, n: utm.N });
                }
            }
            let lineMatch = lineRegex.exec(conteudo);
            if (lineMatch) {
                let encontradas = extrairCoordenadas(lineMatch[1]);
                let verticesScript = [];
                for (let ec of encontradas) {
                    let utm;
                    let lonJaNoDestino = (ec.lon >= limiteFusoSaida.min && ec.lon <= limiteFusoSaida.max);
                    if (manterFuso && !lonJaNoDestino) utm = decimalToUTM(ec.lat, ec.lon, fusoEntrada);
                    else utm = decimalToUTM(ec.lat, ec.lon, fusoSaida);
                    nomes.push(nome); coords.push(utm.E + ',' + utm.N);
                    verticesScript.push({ e: utm.E, n: utm.N });
                }
                if (verticesScript.length >= 2) tracadosScript.push({ nome, coords: verticesScript });
            }
        }
        return res.json({ nomesArray: nomes, coordsArray: coords, scriptData: { pontos: pontosScript, tracados: tracadosScript }, quantidade: coords.length });
    }

    if (tipo === 'coord') {
        let lines = dados.split('\n').filter(l => l.trim() !== '');
        let decimals = [], fusoSaidaArr = [];
        for (let line of lines) {
            let parts = line.split(',');
            if (parts.length >= 2) {
                let E = parseFloat(parts[0]), N = parseFloat(parts[1]);
                if (!isNaN(E) && !isNaN(N)) {
                    let dec = utmToDecimal(E, N, fusoEntrada);
                    decimals.push(dec.lon.toFixed(6) + ',' + dec.lat.toFixed(6));
                    let utm = decimalToUTM(dec.lat, dec.lon, fusoSaida);
                    fusoSaidaArr.push(utm.E + ',' + utm.N);
                }
            }
        }
        return res.json({ decimalArray: decimals, fusoSaidaArray: fusoSaidaArr, quantidade: fusoSaidaArr.length });
    }

    return res.json({ erro: 'Tipo inválido' });
};