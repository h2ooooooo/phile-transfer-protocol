<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Http\Request;

class RequestParameterBagCollection {
    public RequestParameterBag $get;
    public RequestParameterBag $post;

    public function __construct(?array $parameters = null, ?string $rawBody = null) {
        $this->get = new RequestParameterBag('GET', $parameters ?? $_GET);
        $this->post = new RequestParameterBag('POST', $_POST, true, $rawBody);
    }
}
