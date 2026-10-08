<?php
require_once dirname(__FILE__).'/../../autoload.php';

use hserv\utilities\UJwt;

header('Cache-Control: private, no-store');


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  UJwt::json_out(405, ['status'=>405, 'error'=>HEURIST_INVALID_REQUEST, 'message'=>'Method not allowed'], ['Allow'=>'POST']);
}

if(!isset($jwt_Secret) || strlen($jwt_Secret)<8){
  UJwt::json_out(405, ['status'=>405, 'error'=>HEURIST_INVALID_REQUEST, 'message'=>'Method not allowed'], ['Allow'=>'POST']);
}

$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$raw = file_get_contents('php://input');

if(false && $contentType=='application/x-www-form-urlencoded'){
    $in = [];
    parse_str($raw, $in); 
}else{
    $in  = json_decode($raw, true);    
}


$username = $in['username'] ?? null;
$password = $in['password'] ?? null;
$database = $in['db'] ?? null;

if(($in['action'] ?? @$_REQUEST['action']) === 'refresh'){
    // Token renewal (mobile clients): a valid, still-unexpired Bearer token is
    // exchanged for a fresh one. No database session or credentials required.
    $auth = UJwt::get_auth_header();
    if(!$auth || !preg_match('/^Bearer\s+(.+)$/i', $auth, $refresh_matches)){
        UJwt::json_out(401, ['status'=>401, 'error'=>HEURIST_REQUEST_DENIED, 'message'=>'Bearer token is required'], ['WWW-Authenticate' => 'Bearer realm="api", error="invalid_request"']);
    }

    $payload = UJwt::jwt_verify($refresh_matches[1], $jwt_Secret);
    if($payload === false || empty($payload['sub'])){
        UJwt::json_out(401, ['status'=>401, 'error'=>HEURIST_REQUEST_DENIED, 'message'=>'Invalid or expired token'], ['WWW-Authenticate' => 'Bearer realm="api", error="invalid_token"']);
    }

    // Mobile clients may be issued a longer lived token, see the
    // $jwt_TTL_Mobile flag in heuristConfigIni.php (24h default)
    if(!empty($in['mobile']) || ($in['client'] ?? '') === 'mobile'){
        $ttl = (isset($jwt_TTL_Mobile) && intval($jwt_TTL_Mobile) > 0) ? intval($jwt_TTL_Mobile) : 86400;
    }else{
        $ttl = ($jwt_TTL ?? 600);
    }

    $now = time();
    $claims = [
        'sub' => $payload['sub'],
        'iat' => $now,
        'nbf' => $now,
        'exp' => $now + $ttl,
        'scope' => $payload['scope'] ?? 'read:data'
    ];

    UJwt::json_out(200, [
        'access_token' => UJwt::jwt_create($claims, $jwt_Secret),
        'token_type'   => 'Bearer',
        'expires_in'   => $ttl
    ]);
}

$system = new hserv\System();
if( !isset($database) || !$system->init($database) ){
    //$system->errorExitApi();
    UJwt::json_out(400, ['status'=>400, 'error'=>HEURIST_INVALID_REQUEST, 'message'=>'Invalid database parameter'], ['WWW-Authenticate' => 'Basic realm="api", charset="UTF-8"']);
}

if (($in['action'] ?? '') === 'session') {
    // Resolve identity from the existing database-scoped cookie session only.
    $verified = $system->authSession()->loginVerify(true);
    $user = $system->getCurrentUser();
    if (!$verified || !$system->getUserId() || !empty($user['ugr_Permissions']['disabled'])) {
        UJwt::json_out(401, ['status'=>401, 'error'=>HEURIST_REQUEST_DENIED, 'message'=>'No active login for this database']);
    }
    $username = $user['ugr_Name'] ?? '';
} elseif (!$username || !$password || !$system->doLogin($username, $password, 'none')){
  UJwt::json_out(401, ['status'=>401, 'error'=>HEURIST_REQUEST_DENIED, 'message'=>'Invalid credentials'], ['WWW-Authenticate' => 'Basic realm="api", charset="UTF-8"']);
}

$ttl = ($in['client'] ?? '') === 'mobile'
    ? ((isset($jwt_TTL_Mobile) && intval($jwt_TTL_Mobile) > 0) ? intval($jwt_TTL_Mobile) : 86400)
    : ($jwt_TTL ?? 600);

$now = time();
$claims = [
  'sub' => $system->getUserId(),  //$username
  'iat' => $now,
  'nbf' => $now,
  'exp' => $now + $ttl,   
  'scope' => 'read:data' // example
];

$token = UJwt::jwt_create($claims, $jwt_Secret);

UJwt::json_out(200, [
  'access_token' => $token,
  'token_type'   => 'Bearer',
  'expires_in'   => $ttl,
  'db'           => $database,
  'username'     => $username
]);
