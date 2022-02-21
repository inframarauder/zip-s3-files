"use strict";
const AWS = require("aws-sdk");
const archiver = require("archiver");
const stream = require("stream");

//initialise s3 client:
const s3 = new AWS.S3();

//expects Bucket and Prefix to be passed in event.body
exports.handler = async (event) => {
	try {
		const { Bucket, Prefix } =
			typeof event.body === "string" ? JSON.parse(event.body) : event.body;

		//validate incoming request body:
		if (!Bucket || !Prefix) {
			return {
				statusCode: 400,
				body: JSON.stringify({
					message: "Bucket and Prefix are required",
				}),
			};
		}
		//get all files inside prefix
		const s3Data = await s3.listObjectsV2({ Bucket, Prefix }).promise();
		const files = s3Data.Contents.slice(1)
			.map((file) => file.Key)
			.filter((file) => !file.endsWith(".zip"));

		console.log("Files to be zipped", files);

		//get read streams for each file
		const readStreams = files.map((file) => ({
			stream: s3.getObject({ Bucket, Key: file }).createReadStream(),
			name: file.split("/").pop(),
		}));

		const s3UploadResponse = await new Promise((resolve, reject) => {
			//create output stream
			const outputFileKey = `${Prefix}/archive.zip`;
			const outputStream = streamTo(Bucket, outputFileKey, resolve);
			outputStream.on("error", reject);

			//initialise the zip archive
			const archive = archiver("zip", { zlib: { level: 9 } });
			//error handling
			archive.on("error", (err) => {
				throw new Error(err);
			});

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

		//return the link to the zip file:

		return {
			statusCode: 200,
			body: JSON.stringify({
				message: "Success",
				zipFileLink: s3UploadResponse.Location,
			}),
		};
	} catch (error) {
		console.error(error);
		return {
			statusCode: 500,
			body: JSON.stringify({
				message: "Internal Server Error",
			}),
		};
	}
};

const streamTo = (Bucket, Key, resolve) => {
	const passThroughStream = new stream.PassThrough();
	s3.upload(
		{
			Bucket,
			Key,
			Body: passThroughStream,
			ContentType: "application/zip",
		},
		(err, data) => {
			if (err) throw err;
			console.log("Zip uploaded");
			resolve(data);
		}
	);

	return passThroughStream;
};
