<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Controller;

use jalsoedesign\PhileTransferProtocol\Api\Http\FileApi;
use jalsoedesign\PhileTransferProtocol\Api\Http\Request\RequestParameterBagCollection;
use jalsoedesign\PhileTransferProtocol\Api\Http\Request\EncryptedRequest;
use jalsoedesign\PhileTransferProtocol\Api\Http\Response;
use jalsoedesign\PhileTransferProtocol\Util\Utilities;

class FileApiController extends BaseController {
    private FileApi $fileApi;
    private RequestParameterBagCollection $parameters;
    private bool $encrypted;

    /**
     * __construct method.
     *
     * @param string $rootPath The root path for the constructor.
     *
     * @throws \Exception
     */
    public function __construct(string $rootPath, ?array $parameters = null, ?string $rawBody = null) {
        $rootPath = Utilities::normalizePath($rootPath);

        $this->fileApi = new FileApi($rootPath);

        $this->parameters = new RequestParameterBagCollection($parameters, $rawBody);
        $this->encrypted = $parameters !== null;
    }

    public function get(array $params): Response {
        $path = $this->parameters->get->requireString('path');

        return Response::jsonSuccess([
            'file' => $this->fileApi->get($path),
            'path' => $path,
        ]);
    }

    public function list(array $params): Response {
        $path = $this->parameters->get->requireString('path');

        return Response::jsonSuccess([
            'list' => $this->fileApi->list($path),
            'path' => $path,
        ]);
    }

    public function mkdir(array $params): Response {
        $path = $this->parameters->get->requireString('path');

        $this->fileApi->mkdir($path);

        return Response::jsonSuccess([
            'path' => $path,
        ]);
    }

    public function rmdir(array $params): Response {
        $path = $this->parameters->get->requireString('path');

        $this->fileApi->rmdir($path);

        return Response::jsonSuccess([
            'path' => $path,
        ]);
    }

    public function delete(array $params): Response {
        $path = $this->parameters->get->requireString('path');

        $this->fileApi->delete($path);

        return Response::jsonSuccess([
            'path' => $path,
        ]);
    }

    public function rename(array $params): Response {
        $from = $this->parameters->get->requireString('from');
        $to = $this->parameters->get->requireString('to');

        $this->fileApi->rename($from, $to);

        return Response::jsonSuccess([
            'from' => $from,
            'to' => $to,
        ]);
    }

    public function read(array $params): Response {
        $path = $this->parameters->get->requireString('path');
        $start = $this->parameters->get->getInteger('start', 0);

        $contentType = 'text/plain'; // Default content type
        $content = $this->fileApi->read($path, $start, $contentType);

        return new Response(200, $contentType, $content);
    }

    public function write(array $params): Response {
        $path = $this->parameters->get->requireString('path');
        $append = $this->parameters->get->getBoolean('append');
        $start = $this->parameters->get->getInteger('start', 0);

        $content = $this->parameters->post->getRaw();

        $this->fileApi->write($path, $content, $append, $start);

        return Response::jsonSuccess([
            'path' => $path,
        ]);
    }

    public function listPage(array $params): Response {
        $path = $this->parameters->get->getString('path', '.');
        $offset = $this->parameters->get->getInteger('offset', 0);
        $limit = $this->parameters->get->getInteger('limit', 100);
        $result = $this->fileApi->listPage($path, $offset, $limit);
        $result['path'] = $path;

        return Response::jsonSuccess($result);
    }

    public function uploadBegin(array $params): Response {
        $path = $this->parameters->get->requireString('path');
        $append = $this->parameters->get->getBoolean('append', false);
        $start = $this->parameters->get->getInteger('start', 0);

        $upload = $this->uploads()->begin($path, $append, $start);

        if ($this->encrypted) {
            $upload['maxChunkSize'] = min($upload['maxChunkSize'], EncryptedRequest::MAX_PAYLOAD_BYTES);
        }

        return Response::jsonSuccess(['upload' => $upload]);
    }

    public function uploadWrite(array $params): Response {
        $id = $this->parameters->get->requireString('uploadId');
        $this->parameters->get->requireValue('offset');
        $offset = $this->parameters->get->getInteger('offset');
        $content = $this->parameters->post->getRaw();

        return Response::jsonSuccess(['upload' => $this->uploads()->write($id, $offset, $content)]);
    }

    public function uploadCommit(array $params): Response {
        $id = $this->parameters->get->requireString('uploadId');
        $this->parameters->get->requireValue('size');
        $size = $this->parameters->get->getInteger('size');
        $sha256 = $this->parameters->get->requireString('sha256');

        return Response::jsonSuccess($this->uploads()->commit($id, $size, $sha256));
    }

    public function uploadAbort(array $params): Response {
        $id = $this->parameters->get->requireString('uploadId');
        $this->uploads()->abort($id);

        return Response::jsonSuccess([]);
    }

    private function uploads(): \jalsoedesign\PhileTransferProtocol\Api\Http\UploadManager {
        $username = \jalsoedesign\PhileTransferProtocol\Config\Config::instance()->getApiUsername();

        return new \jalsoedesign\PhileTransferProtocol\Api\Http\UploadManager($this->fileApi, 'standalone:' . $username);
    }

    public function chmod(array $params): Response {
        $path = $this->parameters->get->requireString('path');
        $mode = $this->parameters->get->requireString('mode');

        $this->fileApi->chmod($path, $mode);

        return Response::jsonSuccess([
            'path' => $path,
        ]);
    }

    public function getUniqueName(): Response {
        return Response::jsonSuccess([
            'uniqueName' => $this->fileApi->getUniqueName()
        ]);
    }

    public function hello(array $params): Response {
        return new Response(200, 'text/plain', 'hi');
    }
}
