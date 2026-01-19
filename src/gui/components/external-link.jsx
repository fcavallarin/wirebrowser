const ExternalLink = ({ text, href }) => {
  return (
    <span
      className="text-primary-300 cursor-pointer! hover:text-primary-100 underline"
      onClick={() => window.electronAPI.openExternalUrl(href)}
      >
        {text}
      </span>
  )
};

export default ExternalLink;