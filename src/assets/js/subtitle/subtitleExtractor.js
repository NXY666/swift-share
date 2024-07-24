import {Dialogue, Subtitle} from "./videoTrackStation.js";

const langCodes = [
	"ar",
	"cs",
	"da",
	"de",
	"el",
	"en",
	"es",
	"es-150",
	"es-419",
	"fi",
	"fr",
	"he",
	"hr",
	"hu",
	"id",
	"it",
	"ja",
	"ko",
	"ms",
	"nb",
	"nl",
	"pl",
	"pt",
	"pt-br",
	"ro",
	"ru",
	"sv",
	"th",
	"tr",
	"uk",
	"vi",
	"zh",
	"zh-cn",
	"zh-hans",
	"zh-hant",
	"zh-hk",
	"zh-mo",
	"zh-tw"
];
const EnglishDisplayNames = new Intl.DisplayNames(["en"], {
	type: "language",
	languageDisplay: "standard",
	fallback: "none"
});

function getEnglishLangName(langCode) {
	langCode = langCode.toLowerCase().replaceAll("_", "-").trim();
	try {
		return EnglishDisplayNames.of(langCode) ?? "";
	} catch {
		return "";
	}
}

function getLangKeywords(langName) {
	langName = langName.toLowerCase().trim();
	langName = langName.replaceAll(/[()]/g, "");

	return langName.split(" ").filter(t => t.trim());
}

function getLangFullInfo(rawLang) {
	rawLang = rawLang.toLowerCase().trim();
	let t = /[a-z0-9_-]+/g;
	let langKeywords = [];
	for (let rawLangPart of rawLang.matchAll(t)) {
		let langName = getEnglishLangName(rawLangPart[0]);

		if (langName !== "") {
			langKeywords.push(langName.toLowerCase());
		}
	}
	langKeywords.push(rawLang);
	return langKeywords.join(",");
}

class LangHelper {
	code;

	name;

	keywords;

	constructor(langCode) {
		this.code = langCode;
		this.name = getEnglishLangName(langCode);
		this.keywords = getLangKeywords(this.name);
	}

	check(text) {
		let score = 0;
		for (let keyword of this.keywords) {
			if (text.includes(keyword)) {
				score += 1;
			}
		}
		return score;
	}
}

const langHelpers = langCodes.map(lang => new LangHelper(lang));

function getLangCode(rawLang) {
	let langFullInfo = getLangFullInfo(rawLang);

	let langScores = langHelpers.map(langHelper => {
		let code = langHelper.code;
		let score = langHelper.check(langFullInfo);
		return {code, score};
	});

	langScores.sort((a, b) => b.score - a.score);
	let [highestLang] = langScores;
	if (highestLang.score !== 0) {
		return highestLang.code;
	}
}

function* readNextElement(dataBuf, element) {
	if (element.dataEnd > dataBuf.length) {
		throw `invalid element: ${element.dataEnd - dataBuf.length}`;
	}

	let {dataStart, dataEnd} = element;

	while (dataStart < dataEnd) {
		let nextElement = getElement(dataBuf, dataStart);
		dataStart = nextElement.dataEnd;
		yield nextElement;
	}
}

function toU64DataView(buffer, position, length) {
	if (length === 0 || length > 8) {
		throw `invalid length: ${length}`;
	}
	let array = new Uint8Array(8);
	let offset = 8 - length;
	for (let a = 0; a < length; a++) {
		array[offset + a] = buffer[position + a];
	}
	return new DataView(array.buffer).getBigUint64(0);
}

function clz8(byte) {
	for (let b = 7; b >= 0; b--) {
		if (byte >> b === 1) {
			return 8 - b;
		}
	}
	return 0;
}

function getDataRange(buffer, position) {
	let byte = buffer[position];
	let length = clz8(byte);
	let dataView = toU64DataView(buffer, position, length);
	let size = BigInt.asUintN(length * 7, dataView);
	return [Number(size), length];
}

function getByteLength(buffer, position) {
	let byte = buffer[position];
	let length = clz8(byte);
	let i = toU64DataView(buffer, position, length);
	return [Number(i), length];
}

function getElement(buffer, position) {
	let currPos = position;
	let [id, length] = getByteLength(buffer, currPos);
	currPos += length;

	if (buffer[currPos] === 0xff) {
		throw "unknown data size";
	}

	let [dataSize, dataLen] = getDataRange(buffer, currPos);
	currPos += dataLen;

	let dataStart = currPos;
	let dataEnd = dataStart + dataSize;
	return {id, position, dataSize, dataStart, dataEnd};
}

function parseIntegerElementData(buffer, element) {
	let {dataStart, dataEnd} = element;

	let dataLen = dataEnd - dataStart;
	let i = toU64DataView(buffer, dataStart, dataLen);
	return Number(i);
}

function parseStringElementData(buffer, element) {
	let elementBuffer = buffer.subarray(element.dataStart, element.dataEnd);
	return new TextDecoder().decode(elementBuffer);
}

function parseFloatElementData(buffer, element) {
	let {dataStart, dataEnd} = element;

	let dataLen = dataEnd - dataStart;
	let dataView = new DataView(buffer.buffer);
	if (dataLen === 8) {
		return dataView.getFloat64(dataStart);
	}
	if (dataLen === 4) {
		return dataView.getFloat32(dataStart);
	}
	throw `invalid length: ${dataLen}`;
}

function findElement(buffer, element, id) {
	for (let nextElement of readNextElement(buffer, element)) {
		if (nextElement.id === id) {
			return nextElement;
		}
	}
	return null;
}

function parseElementData(data, element, type) {
	type = type ?? "integer";

	if (type === "integer") {
		return parseIntegerElementData(data, element);
	}

	if (type === "string") {
		return parseStringElementData(data, element);
	}
	if (type === "float") {
		return parseFloatElementData(data, element);
	}
	throw `invalid type: ${type}`;
}

function readElementFieldsFromBuffer(buffer, infoElement, elementFields, info) {
	let elementFieldIdMap = new Map();
	for (let elementField of elementFields) {
		elementFieldIdMap.set(elementField.id, elementField);
	}
	for (let nextElement of readNextElement(buffer, infoElement)) {
		let elementField = elementFieldIdMap.get(nextElement.id);
		if (elementField === undefined) {
			continue;
		}
		let {key, type} = elementField;
		info[key] = parseElementData(buffer, nextElement, type);
	}
}

const SegmentInfoElementFields = [
	{key: "id", id: 0x53ab},
	{key: "position", id: 0x53ac}
];
const SegmentTimeElementFields = [
	{key: "timestampScale", id: 0x2ad7b1},
	{key: "duration", id: 0x4489, type: "float"}
];
const TrackElementFields = [
	{key: "number", id: 0xd7},
	{key: "type", id: 0x83},
	{key: "name", id: 0x536e, type: "string"},
	{key: "codecId", id: 0x86, type: "string"},
	{key: "language", id: 0x22b59c, type: "string"},
	{key: "languageBCP47", id: 0x22b59d, type: "string"}
];
const ClusterElementFields = [
	{key: "track", id: 0xf7},
	{key: "cluster", id: 0xf1},
	{key: "block", id: 0xf0},
	{key: "duration", id: 0xb2}
];

async function getDocs(reader) {
	let header = null;
	let segment = null;
	let topLevels = [];
	let seeks = [];
	let filePartBuf = await reader.read(0, 64 * 1024);
	let partLen = filePartBuf.length;
	let position = 0;

	while (position < partLen) {
		let d = getElement(filePartBuf, position);
		if (d.id === 0x1a45dfa3) {
			header = d;
			position = d.dataEnd;
			continue;
		}
		if (d.id === 0x18538067) {
			segment = d;
			position = d.dataStart;
			continue;
		}
		topLevels.push(d);
		position = d.dataEnd;

		if (d.id === 0x1f43b675) {
			break;
		}
	}

	if (header === null || segment === null) {
		throw "invalid matroska data";
	}
	let seekHeadElement = topLevels.find(d => d.id === 0x114d9b74);
	if (seekHeadElement === undefined) {
		throw "missing SeekHead element";
	}
	for (let infoElement of readNextElement(filePartBuf, seekHeadElement)) {
		if (infoElement.id === 0x4dbb) {
			let info = {id: -1, position: -1};
			readElementFieldsFromBuffer(filePartBuf, infoElement, SegmentInfoElementFields, info);
			seeks.push(info);
		}
	}
	for (let seek of seeks) {
		seek.position += segment.dataStart;
	}
	let infoElement = topLevels.find(d => d.id === 0x1549a966);
	if (infoElement === undefined) {
		throw "missing Info element";
	}
	let info = {
		timestampScale: -1,
		duration: -1
	};
	readElementFieldsFromBuffer(filePartBuf, infoElement, SegmentTimeElementFields, info);

	return {header, segment, topLevels, seeks, info};
}

async function readFilePart(reader, position) {
	let filePartBuf;
	filePartBuf = await reader.read(position, 16);
	let element = getElement(filePartBuf, 0);
	filePartBuf = await reader.read(position, element.dataEnd);
	return [filePartBuf, element];
}

async function getTracks(reader, doc) {
	let seek = doc.seeks.find(seek => seek.id === 0x1654ae6b);
	if (seek === undefined) {
		return [];
	}
	let [filePartBuf, element] = await readFilePart(reader, seek.position);
	let tracks = [];
	for (let nextElement of readNextElement(filePartBuf, element)) {
		if (nextElement.id === 0xae) {
			let track = {
				index: tracks.length,
				number: -1,
				type: -1,
				name: "",
				codecId: "",
				language: "",
				languageBCP47: ""
			};
			readElementFieldsFromBuffer(filePartBuf, nextElement, TrackElementFields, track);
			tracks.push(track);

		}
	}
	return tracks;
}

async function getCues(header, doc) {
	let seek = doc.seeks.find(seek => seek.id === 0x1c53bb6b);
	if (seek === undefined) {
		return [];
	}
	let [filePartBuf, element] = await readFilePart(header, seek.position);
	let cues = [];
	for (let nextElement of readNextElement(filePartBuf, element)) {
		if (nextElement.id === 0xbb) {
			let cuePointElement = findElement(filePartBuf, nextElement, 0xb3);
			let cueTime = parseIntegerElementData(filePartBuf, cuePointElement);
			for (let cueTrackElement of readNextElement(filePartBuf, nextElement)) {
				if (cueTrackElement.id === 0xb7) {
					let cue = {
						time: cueTime,
						track: -1,
						cluster: -1,
						block: -1,
						duration: -1
					};
					readElementFieldsFromBuffer(filePartBuf, cueTrackElement, ClusterElementFields, cue);
					cues.push(cue);
				}
			}

		}
	}
	for (let cue of cues) {
		cue.cluster += doc.segment.dataStart;
	}
	return cues;
}

function processCluster(buffer, clusterElement, trackMap) {
	let timestamp = -1;
	let blocks = [];
	for (let element of readNextElement(buffer, clusterElement)) {
		if (element.id === 0xe7) {
			timestamp = parseIntegerElementData(buffer, element);
			continue;
		}
		if (element.id === 0xa0) {
			let duration = 0;
			let c = findElement(buffer, element, 0x9b);

			if (c) {
				duration = parseIntegerElementData(buffer, c);
			}

			let block = findElement(buffer, element, 0xa1);
			blocks.push({duration, block});
			continue;
		}
		if (element.id === 0xa3) {
			blocks.push({duration: 0, block: element});
		}
	}
	let dataView = new DataView(buffer.buffer);
	for (let {duration, block} of blocks) {
		let {dataStart, dataEnd} = block;
		let [dataSize, dataLen] = getDataRange(buffer, dataStart);
		dataStart += dataLen;
		let blockData = trackMap.get(dataSize);
		if (blockData === undefined) {
			continue;
		}
		let timeoffset = dataView.getInt16(dataStart);
		dataStart += 2;

		let keyframe = (buffer[dataStart] & 0b10000000) !== 0;
		dataStart += 1;

		let content = buffer.slice(dataStart, dataEnd);
		blockData.push({timestamp, timeoffset, duration, keyframe, content});
	}
}

async function getTrackBlocks(reader, tracks, cues) {
	let trackMap = new Map();
	for (let track of tracks) {
		trackMap.set(track.number, []);
	}
	let clusters = new Set();
	for (let cue of cues) {
		if (trackMap.has(cue.track)) {
			clusters.add(cue.cluster);
		}
	}
	for (let cluster of clusters) {
		let [clusterBuffer, clusterElement] = await readFilePart(reader, cluster);
		if (clusterElement.id === 0x1f43b675) {
			processCluster(clusterBuffer, clusterElement, trackMap);
		}
	}
	let blocksByTrack = [];
	for (let track of tracks) {
		let blocks = trackMap.get(track.number);
		blocksByTrack.push({track, blocks});
	}
	return blocksByTrack;
}

const maxDuration = 60 * 1000;

function addDialogues(dialogues, blocks) {
	let decoder = new TextDecoder();
	for (let block of blocks) {
		let timestamp = block.timestamp + block.timeoffset;
		let duration = block.duration;
		let content = decoder.decode(block.content);
		dialogues.push(new Dialogue(timestamp, duration, content));
	}
	dialogues.sort((a, b) => a.start - b.start);
}

function getTrackLangCode(track) {
	let trackLang;

	if (track.languageBCP47 !== "") {
		trackLang = track.languageBCP47;
	} else {
		trackLang = track.language;
	}

	trackLang = trackLang.toLowerCase().replaceAll("_", "-").trim();

	if (trackLang === "") {
		trackLang = "und";
	}

	try {
		trackLang = globalThis.Intl.getCanonicalLocales(trackLang)[0].toLowerCase();
	} catch {}
	let langCode = getLangCode(`${trackLang},${track.name}`);
	return langCode !== undefined && (trackLang === "und" || langCode.startsWith(`${trackLang}-`)) ? langCode : trackLang;
}

class FileReader {
	file;

	constructor(file) {
		this.file = file;
	}

	async read(start, length) {
		let end = start + length;
		let buf = await this.file.slice(start, end).arrayBuffer();
		return new Uint8Array(buf);
	}
}

class UrlFileReader {
	url;

	constructor(url) {
		this.url = url;
	}

	async read(start, length) {
		let end = start + length;
		let headers = {Range: `bytes=${start}-${end}`};
		let arrayBuffer = await (await fetch(this.url, {headers})).arrayBuffer();
		return new Uint8Array(arrayBuffer);
	}
}

export class SubtitleExtractor {
	station;

	reader;

	doc;

	tracks;

	cues;

	chunks;

	relations;

	constructor(station, reader, doc, tracks, cues) {
		this.station = station;
		this.reader = reader;
		this.doc = doc;
		this.tracks = tracks;
		this.cues = cues;
		this.chunks = this.createChunks();
		this.relations = [];
		for (let track of tracks) {
			if (track.type !== 17 || !track.codecId.startsWith("S_TEXT/")) {
				continue;
			}
			let id = `internal:${track.number}`;
			let code = getTrackLangCode(track);
			let name = track.name;
			let subtitle = new Subtitle([]);
			this.relations.push({id, code, name, subtitle, track});
		}
		this.relations.sort((a, b) => a.code > b.code ? 1 : -1);
		for (let relation of this.relations) {
			this.station.add(relation);
		}
	}

	static async fromFile(station, n) {
		let reader = new FileReader(n);
		let doc = await getDocs(reader);
		let tracks = await getTracks(reader, doc);
		let cues = await getCues(reader, doc);
		return new SubtitleExtractor(station, reader, doc, tracks, cues);
	}

	static async fromUrl(station, url) {
		let header = new UrlFileReader(url);
		let doc = await getDocs(header);
		let tracks = await getTracks(header, doc);
		let cues = await getCues(header, doc);
		return new SubtitleExtractor(station, header, doc, tracks, cues);
	}

	createChunks() {
		let clusterMap = new Map();
		for (let cue of this.cues) {
			let clusterCues = clusterMap.get(cue.cluster);

			if (clusterCues === undefined) {
				clusterMap.set(cue.cluster, [cue]);
			} else {
				clusterCues.push(cue);
			}
		}
		let chunkMap = new Map();
		for (let cues of clusterMap.values()) {
			let time = cues[0].time;
			let chunkIndex = Math.floor(time / maxDuration);
			let chunk = chunkMap.get(chunkIndex);
			if (chunk === undefined) {
				chunkMap.set(chunkIndex, {cues, flag: true});
			} else {
				for (let cue of cues) {
					chunk.cues.push(cue);
				}
			}
		}
		return chunkMap;
	}

	async loadCues(cues) {
		let tracks = this.relations.map(r => r.track);
		let trackBlocks = await getTrackBlocks(this.reader, tracks, cues);
		for (let [index, relation] of this.relations.entries()) {
			let blocks = trackBlocks[index].blocks;
			let dialogues = relation.subtitle.dialogues;
			addDialogues(dialogues, blocks);
		}
	}

	async addChunks(chunkIndices) {
		let chunks = [];
		for (let chunkIndex of chunkIndices) {
			let chunk = this.chunks.get(chunkIndex);

			if (chunk?.flag) {
				chunk.flag = false;
				chunks.push(chunk);
			}
		}
		for (let chunk of chunks) {
			await this.loadCues(chunk.cues);
		}

		if (chunks.length > 0) {
			await this.station.flush();
		}
	}

	async refresh() {
		let t = this.station.player.currentTime * 1000; /* 1e3 */
		let n = Math.floor(t / maxDuration);
		await this.addChunks([n - 1, n, n + 1]);
	}
}
