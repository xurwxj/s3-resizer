'use strict'


const AWS = require('aws-sdk');
const S3 = new AWS.S3({
    signatureVersion: 'v4'
});
const Sharp = require('sharp');
// const PathPattern = /(.*\/)?(.*)\/(.*)/;

// parameters

const s3Obj = {
    "E31XAMKJNE3OST": {
        "bucket": "t3dpub",
        "url": "https://tawscdn.dental3dcloud.com"
    },
    "E2N8JHFBC9EYJK": {
        "bucket": "cloud3pub",
        "url": "https://awscdn.dental3dcloud.com"
    }
}


exports.handler = async (event, context, callback) => {
    // You could get path, parameter, headers, body value from event
    let request = event.Records[0].cf.request;
    console.log("event: ", event.Records[0].cf);
    const distributionID = event.Records[0].cf.config.distributionId;
    const BUCKET = s3Obj[distributionID].bucket;
    let path = request.uri;
    if (path.charAt(0) === "/") {
        path = path.substr(1);
    }
    console.log("path: ", path);
    
    const URL = s3Obj[distributionID].url;
    const parts = path.split("/");
    const originFile = parts.slice(1).join("/") || '';
    console.log("originFile: ", originFile);
    const resizeOption = parts.slice(0, 1).join("") || ""; // e.g. "150x150_max"
    console.log("resizeOption: ", resizeOption);
    const sizeAndAction = resizeOption.split('_');
    console.log("sizeAndAction: ", sizeAndAction);
    const filename = parts.slice(parts.length - 1).join("") || "";
    console.log("filename: ", filename);

    const sizes = sizeAndAction.slice(0, 1).join("").split("x");
    const action = sizeAndAction.length > 1 ? sizeAndAction.slice(1).join("") : null;
    let needResize = false;
    let headCode;
    try {
        headCode = await S3.headObject({
            Bucket: BUCKET,
            Key: path
        }).promise();
        console.log("head direct for key: ", path);

        callback(null, request);
        return;
    } catch (error) {
        console.log("head err: ", error, " for key: ", path);
        if (error.code === "NotFound" && resizeOption.indexOf("x") > 0) {
            needResize = true;
        }
    }

    if (needResize) {

        // Action validation.
        if (action && action !== 'max' && action !== 'min') {
            callback(null, request);
            return;
        }

        try {
            const data = await S3
                .getObject({
                    Bucket: BUCKET,
                    Key: originFile
                })
                .promise();

            const width = sizes.slice(0, 1).join("") === 'AUTO' ? null : parseInt(sizes.slice(0, 1).join(""));
            const height = sizes.slice(1).join("") === 'AUTO' ? null : parseInt(sizes.slice(1).join(""));
            let fit;
            switch (action) {
                case 'max':
                    fit = 'inside';
                    break;
                case 'min':
                    fit = 'outside';
                    break;
                default:
                    fit = 'contain';
                    break;
            }
            const result = await Sharp(data.Body, {
                    failOnError: false
                })
                .resize(width, height, {
                    withoutEnlargement: false,
                    fit
                })
                .rotate()
                .toBuffer();

            await S3.putObject({
                Body: result,
                Bucket: BUCKET,
                ContentType: data.ContentType,
                Key: path,
                CacheControl: 'public, max-age=86400'
            }).promise();

            callback(null, request);
            return;
        } catch (e) {
            console.log("doing err result: ", e);
            callback(null, request);
            return;
        }
    }
}