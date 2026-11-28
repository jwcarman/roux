// Package bindings reads the service bindings a platform mounts into the environment variables roux
// reads, so an app reads only its environment, on a laptop and on a platform alike. It follows
// servicebinding.io: SERVICE_BINDING_ROOT holds a directory per service, one file per entry, and
// always a type entry.
//
// The types roux knows, and what each sets:
//
//	postgresql  uri, or host, port, database, username, password (and sslmode):
//	            DATABASE_URL and TEST_DATABASE_URL
//	smtp        host, port (and username with password, from): SMTP_ADDR, SMTP_USERNAME,
//	            SMTP_PASSWORD, MAIL_FROM
//	mailpit     uri, the Playwright suite's inbox: E2E_MAILPIT_URL
//
// A variable already set (not empty) always wins: a binding only fills what is unset. Other types
// are ignored, as are names starting with a dot (Kubernetes' own files). A binding that cannot be
// read, lacks an entry, or shares its type with another stops Apply before it sets anything.
package bindings

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// Apply sets the variables the bindings under SERVICE_BINDING_ROOT give, leaving any already set;
// with no SERVICE_BINDING_ROOT it does nothing. app.Main and pgtest call it before they read the
// environment.
func Apply() error {
	root := os.Getenv("SERVICE_BINDING_ROOT")
	if root == "" {
		return nil
	}
	found, err := read(root)
	if err != nil {
		return err
	}
	var settings [][2]string
	byType := map[string]string{}
	for _, b := range found {
		translate, known := types[b.kind]
		if !known {
			continue
		}
		if other, twice := byType[b.kind]; twice {
			return fmt.Errorf("bindings %q and %q are both %s: roux uses one; remove the other from SERVICE_BINDING_ROOT (%s)",
				other, b.name, b.kind, root)
		}
		byType[b.kind] = b.name
		pairs, err := translate(b)
		if err != nil {
			return err
		}
		settings = append(settings, pairs...)
	}
	for _, pair := range settings {
		if os.Getenv(pair[0]) == "" {
			if err := os.Setenv(pair[0], pair[1]); err != nil {
				return err
			}
		}
	}
	return nil
}

type binding struct {
	name    string
	kind    string
	entries map[string]string
}

// entry is one entry's value, or "" when it is missing or empty.
func (b binding) entry(name string) string { return b.entries[name] }

// need fails naming the first of names the binding lacks, and what the type takes.
func (b binding) need(takes string, names ...string) error {
	for _, name := range names {
		if b.entry(name) == "" {
			return fmt.Errorf("binding %q (%s) has no %s entry: a %s binding takes %s", b.name, b.kind, name, b.kind, takes)
		}
	}
	return nil
}

var types = map[string]func(binding) ([][2]string, error){
	"postgresql": postgresql,
	"smtp":       smtp,
	"mailpit":    mailpit,
}

func postgresql(b binding) ([][2]string, error) {
	raw := b.entry("uri")
	if raw == "" {
		if err := b.need("uri, or host, port, database, username and password (and sslmode)",
			"host", "port", "database", "username", "password"); err != nil {
			return nil, err
		}
		u := url.URL{
			Scheme: "postgres",
			User:   url.UserPassword(b.entry("username"), b.entry("password")),
			Host:   net.JoinHostPort(b.entry("host"), b.entry("port")),
			Path:   "/" + b.entry("database"),
		}
		if mode := b.entry("sslmode"); mode != "" {
			u.RawQuery = url.Values{"sslmode": {mode}}.Encode()
		}
		raw = u.String()
	}
	return [][2]string{{"DATABASE_URL", raw}, {"TEST_DATABASE_URL", raw}}, nil
}

func smtp(b binding) ([][2]string, error) {
	const takes = "host and port (and username with password, from)"
	if err := b.need(takes, "host", "port"); err != nil {
		return nil, err
	}
	user, password := b.entry("username"), b.entry("password")
	if (user == "") != (password == "") {
		return nil, fmt.Errorf("binding %q (smtp) has one of username and password: give both to sign in to the mail server, or neither", b.name)
	}
	pairs := [][2]string{{"SMTP_ADDR", net.JoinHostPort(b.entry("host"), b.entry("port"))}}
	for entry, variable := range map[string]string{"username": "SMTP_USERNAME", "password": "SMTP_PASSWORD", "from": "MAIL_FROM"} {
		if value := b.entry(entry); value != "" {
			pairs = append(pairs, [2]string{variable, value})
		}
	}
	return pairs, nil
}

func mailpit(b binding) ([][2]string, error) {
	if err := b.need("uri, Mailpit's web address", "uri"); err != nil {
		return nil, err
	}
	return [][2]string{{"E2E_MAILPIT_URL", b.entry("uri")}}, nil
}

// read is every binding under root, in name order.
func read(root string) ([]binding, error) {
	dirs, err := os.ReadDir(root)
	if err != nil {
		return nil, fmt.Errorf("SERVICE_BINDING_ROOT is %s, which cannot be read: %w (unset it, or mount the bindings there)", root, err)
	}
	var found []binding
	for _, dir := range dirs {
		path := filepath.Join(root, dir.Name())
		if hidden(dir.Name()) || !isDir(path) {
			continue
		}
		b, err := readOne(dir.Name(), path)
		if err != nil {
			return nil, err
		}
		found = append(found, b)
	}
	return found, nil
}

func readOne(name, path string) (binding, error) {
	b := binding{name: name, entries: map[string]string{}}
	files, err := os.ReadDir(path)
	if err != nil {
		return b, fmt.Errorf("binding %q cannot be read: %w", name, err)
	}
	for _, file := range files {
		if hidden(file.Name()) || isDir(filepath.Join(path, file.Name())) {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(path, file.Name()))
		if err != nil {
			return b, fmt.Errorf("binding %q: its %s entry cannot be read: %w", name, file.Name(), err)
		}
		b.entries[file.Name()] = strings.TrimRight(string(raw), "\r\n")
	}
	b.kind = b.entry("type")
	if b.kind == "" {
		return b, fmt.Errorf("binding %q has no type entry: every binding names its type (postgresql, smtp, mailpit, ...) in a file called type", name)
	}
	return b, nil
}

func hidden(name string) bool { return strings.HasPrefix(name, ".") }

// isDir follows links, as Kubernetes projects bindings through them.
func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}
