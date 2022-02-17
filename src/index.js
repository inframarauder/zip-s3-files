"use strict";
const AWS = require("aws-sdk");
const archiver = require("archiver");
const stream = require("stream");

//initialise s3 client:
const s3 = new AWS.S3();

exports.handler = async (event) => {
	try {
		const { Bucket, Prefix } = event;

		//get all files inside prefix:
		const s3Data = await s3.listObjectsV2({ Bucket, Prefix }).promise();
		const files = s3Data.Contents.slice(1).map((file) => file.Key);

		//get read streams for each file
		const readStreams = files.map((file) => ({
			stream: s3.getObject({ Bucket, Key: file }).createReadStream(),
			name: file.split("/").pop(),
		}));

		await new Promise((resolve, reject) => {
			//get the output stream
			const outputZipFileKey = `${Prefix}/archive.zip`;
			const outputStream = getOutputStream(Bucket, outputZipFileKey);

			//initialise the zip archive
			const archive = archiver("zip", { zlib: { level: 9 } });
			//error handling
			archive.on("error", (err) => {
				throw new Error(err);
			});

			//listen and react to outputStream events
			outputStream.on("close", resolve);
			outputStream.on("end", resolve);
			outputStream.on("error", reject);

			//pipe the zip archive stream to the output stream
			archive.pipe(outputStream);

			//add each file to the zip archive
			readStreams.forEach((readStream) => {
				archive.append(readStream.stream, { name: readStream.name });
			});

			//finalize the zip archive
			archive.finalize();
		}).catch((err) => {
			throw new Error(err);
		});
	} catch (error) {
		console.error(error);
	}
};

//util function to get the output stream for the zip file
const getOutputStream = (Bucket, Key) => {
	const passThroughStream = new stream.PassThrough();
	s3.upload({ Bucket, Key, Body: passThroughStream }, (err) => {
		if (err) {
			throw new Error(err);
		} else {
			console.log("Zip Uploaded to s3");
		}
	});

	return passThroughStream;
};
