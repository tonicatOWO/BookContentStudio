This certificate and public test private key are exclusively for the offline
loopback HTTPS regression in --self-test. They are not credentials and must
never be used by a production service. Only the self-test browser context
accepts this self-signed certificate; normal scraping verifies server TLS.
