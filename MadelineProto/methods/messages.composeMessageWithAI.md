---
title: "messages.composeMessageWithAI"
description: "messages.composeMessageWithAI parameters, return type and example"
grand_parent: "Telegram RPC API"
parent: "Methods"
image: https://docs.madelineproto.xyz/favicons/android-chrome-256x256.png
redirect_from: /API_docs/methods/messages_composeMessageWithAI.html
---
# Method: messages.composeMessageWithAI
[Back to methods index](index.html)



### Parameters:

| Name     |    Type       | Required |
|----------|---------------|----------|
|proofread|[Bool](/API_docs/types/Bool.html) | Optional|
|emojify|[Bool](/API_docs/types/Bool.html) | Optional|
|text|[TextWithEntities](/API_docs/types/TextWithEntities.html) | Yes|
|translate\_to\_lang|[string](/API_docs/types/string.html) | Optional|
|change\_tone|[string](/API_docs/types/string.html) | Optional|


### Return type: [messages.ComposedMessageWithAI](/API_docs/types/messages.ComposedMessageWithAI.html)

### Can users use this method: **YES**


### Can bots use this method: **YES**


### Can bots use this method over a business connection with the `businessConnectionId` flag: **NO**


### MadelineProto Example ([now async for huge speed and parallelism!](https://docs.madelineproto.xyz/docs/ASYNC.html)):


```php
if (!file_exists('madeline.php')) {
    copy('https://phar.madelineproto.xyz/madeline.php', 'madeline.php');
}
include 'madeline.php';

$MadelineProto = new \danog\MadelineProto\API('session.madeline');
$MadelineProto->start();

$messages_ComposedMessageWithAI = $MadelineProto->messages->composeMessageWithAI(proofread: $Bool, emojify: $Bool, text: $TextWithEntities, translate_to_lang: 'string', change_tone: 'string', );
```

